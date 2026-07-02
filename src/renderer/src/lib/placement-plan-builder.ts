import type { PlacementPlanV2, PlacementCandidate, ProposedPlacementBlock, UnplacedPlacementItem, PlacementMode } from '@shared/placement-model'
import { buildPlacementCandidates, type BuildPlacementCandidatesInput, type AnyDeadlineCrisisContext } from './placement-input-adapter'
import type { AnyPlanningContextV2 } from './placement-window-selector'
import { buildDeadlineCrisisPlacementPlan } from './deadline-crisis-placement-strategy'
import { buildRecoveryPlacementPlan } from './recovery-placement-strategy'
import { buildNormalPlacementPlan } from './normal-placement-strategy'
import { resolvePlacementConflicts } from './placement-conflict-resolver'
import { explainPlacementPlan } from './placement-explanation-engine'
import { runPlacementDiagnostics } from './placement-diagnostics'

export interface BuildPlacementPlanV2Input extends BuildPlacementCandidatesInput {
  userId: string
  dateRange: { startDate: string; endDate: string }
  planningContext: AnyPlanningContextV2 & { lockedBlocks?: Array<{ start: string; end: string; type: string }> }
  mode?: PlacementMode | 'auto'
  idFactory?: () => string
}

export function buildPlacementPlanV2(input: BuildPlacementPlanV2Input): PlacementPlanV2 {
  // 1. Build candidates
  const candidates = buildPlacementCandidates(input)

  // 2. Determine global mode
  let mode: PlacementMode = 'normal'
  if (input.mode && input.mode !== 'auto') {
    mode = input.mode
  } else {
    // Auto determination
    const contexts = input.deadlineCrisisContexts || []
    const hasImpossible = contexts.some(c => c.crisisLevel === 'impossible_full_completion')
    const hasRescue = contexts.some(c => c.recommendedMode === 'rescue_plan')
    const hasCritical = contexts.some(c => c.crisisLevel === 'critical')

    if (hasImpossible) mode = 'minimum_viable'
    else if (hasRescue) mode = 'rescue'
    else if (hasCritical) mode = 'intensive'
  }

  // 3. Partition candidates so they don't get placed multiple times
  const crisisCandidates: PlacementCandidate[] = []
  const recoveryCandidates: PlacementCandidate[] = []
  const normalCandidates: PlacementCandidate[] = []

  const crisisContextMap = new Map((input.deadlineCrisisContexts || []).map(c => [c.targetId, c]))

  for (const candidate of candidates) {
    const crisis = crisisContextMap.get(candidate.targetId)
    const isCrisis = crisis && ['critical', 'rescue_required', 'impossible_full_completion'].includes(crisis.crisisLevel)
    
    // Check if recovery is needed (e.g. stagnant objective or avoided task)
    const isAvoided = candidate.targetStatus === 'avoided' || candidate.targetStatus === 'stagnant'
    const isStagnantObj = candidate.targetType === 'objective' && candidate.placementModeHint === 'manual_review'
    const isRecovery = !isCrisis && (isAvoided || isStagnantObj)

    if (isCrisis) crisisCandidates.push(candidate)
    else if (isRecovery) recoveryCandidates.push(candidate)
    else normalCandidates.push(candidate)
  }

  // 4. Run strategies sequentially
  let allBlocks: ProposedPlacementBlock[] = []
  const allUnplaced: UnplacedPlacementItem[] = []
  const warnings: string[] = []

  // Helper to pass updated proposed blocks as locked context to next strategies?
  // Actually the requirements say the conflict resolver will handle overlaps.
  // But running them independently and then resolving is fine, or we could pass `usedWindowIds` or existing blocks.
  // The strategies take `existingProposedBlocks` (except we didn't add it to their root input interface, only constraint engine).
  // Let's just collect all and resolve conflicts.

  if (crisisCandidates.length > 0) {
    const res = buildDeadlineCrisisPlacementPlan({
      candidates: crisisCandidates,
      deadlineCrisisContexts: input.deadlineCrisisContexts || [],
      planningContext: input.planningContext,
      userModel: input.userModel,
      now: input.now,
      idFactory: input.idFactory
    })
    allBlocks.push(...res.proposedBlocks)
    allUnplaced.push(...res.unplacedItems)
  }

  if (recoveryCandidates.length > 0) {
    // We should ideally prevent normal strategies from using the same windows
    // but the conflict resolver will fix it if they do.
    const res = buildRecoveryPlacementPlan({
      candidates: recoveryCandidates,
      planningContext: input.planningContext,
      userModel: input.userModel,
      now: input.now,
      idFactory: input.idFactory
    })
    allBlocks.push(...res.proposedBlocks)
    allUnplaced.push(...res.unplacedItems)
  }

  if (normalCandidates.length > 0) {
    const res = buildNormalPlacementPlan({
      candidates: normalCandidates,
      planningContext: input.planningContext,
      priorityScoresV2: input.priorityScoresV2,
      userModel: input.userModel,
      now: input.now,
      idFactory: input.idFactory
    })
    allBlocks.push(...res.proposedBlocks)
    allUnplaced.push(...res.unplacedItems)
  }

  // 5. Resolve conflicts
  const resolution = resolvePlacementConflicts({
    proposedBlocks: allBlocks,
    planningContext: input.planningContext
  })

  const finalBlocks = resolution.blocks
  warnings.push(...resolution.warnings)

  // 6. Calculate summary
  let totalProposedMinutes = 0
  let deepWorkMinutes = 0
  let shortActionMinutes = 0
  let rescueMinutes = 0
  let bufferMinutes = 0
  const usedWindowIds = new Set<string>()

  for (const b of finalBlocks) {
    totalProposedMinutes += b.durationMinutes
    usedWindowIds.add(b.sourceWindowId)
    if (b.kind === 'deep_work') deepWorkMinutes += b.durationMinutes
    if (b.kind === 'short_action') shortActionMinutes += b.durationMinutes
    if (b.placementMode === 'rescue' || b.placementMode === 'minimum_viable') rescueMinutes += b.durationMinutes
    if (b.kind === 'buffer') bufferMinutes += b.durationMinutes
  }

  // Average confidence
  const confidences = [...finalBlocks.map(b => b.confidence), ...allUnplaced.map(u => u.confidence)]
  const avgConfidence = confidences.length > 0 ? Math.floor(confidences.reduce((a, b) => a + b, 0) / confidences.length) : 100

  // 7. Initialize Plan
  const plan: PlacementPlanV2 = {
    userId: input.userId,
    dateRange: input.dateRange,
    mode,
    proposedBlocks: finalBlocks,
    unplacedItems: allUnplaced,
    usedWindowIds: Array.from(usedWindowIds),
    summary: {
      totalProposedMinutes,
      deepWorkMinutes,
      shortActionMinutes,
      rescueMinutes,
      bufferMinutes,
      unplacedCount: allUnplaced.length
    },
    warnings,
    explanation: { title: '', summary: '', reasons: [] },
    confidence: avgConfidence,
    metadata: {
      modelVersion: 2,
      createdAt: input.now || new Date().toISOString(),
      updatedAt: input.now || new Date().toISOString(),
      source: 'placement_engine'
    }
  }

  // 8. Generate explanations
  explainPlacementPlan(plan)

  // 9. Generate diagnostics
  plan.diagnostics = runPlacementDiagnostics(plan, input.planningContext)

  return plan
}
