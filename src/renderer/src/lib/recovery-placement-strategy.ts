import type { PlacementCandidate, ProposedPlacementBlock, UnplacedPlacementItem, PlacementBlockKind } from '@shared/placement-model'
import type { AnyPlanningContextV2 } from './placement-window-selector'
import { selectCandidateWindows } from './placement-window-selector'
import { calculateWindowFit } from './task-fit-engine'
import { calculateProposedBlockSize } from './block-sizing-engine'
import { validateProposedBlock } from './placement-constraint-engine'

export interface BuildRecoveryPlacementPlanInput {
  candidates: PlacementCandidate[]
  planningContext: AnyPlanningContextV2 & { lockedBlocks?: Array<{ start: string; end: string; type: string }> }
  userModel?: unknown
  now?: string
  idFactory?: () => string
}

export interface PlacementStrategyResult {
  proposedBlocks: ProposedPlacementBlock[]
  unplacedItems: UnplacedPlacementItem[]
}

export function buildRecoveryPlacementPlan(input: BuildRecoveryPlacementPlanInput): PlacementStrategyResult {
  const { candidates, planningContext, idFactory } = input
  
  const proposedBlocks: ProposedPlacementBlock[] = []
  const unplacedItems: UnplacedPlacementItem[] = []
  const usedWindowIds: string[] = []

  let blockCounter = 1
  const generateId = idFactory ?? (() => `block-r-${Date.now()}-${blockCounter++}`)

  // Sort by recovery priority or general priority
  const sortedCandidates = [...candidates].sort((a, b) => {
    return (b.recoveryPriorityScore ?? b.priorityScore) - (a.recoveryPriorityScore ?? a.priorityScore)
  })

  for (const candidate of sortedCandidates) {
    const windows = selectCandidateWindows({ candidate, planningContext, usedWindowIds })
    
    if (windows.length === 0) {
      unplacedItems.push({
        targetType: candidate.targetType,
        targetId: candidate.targetId,
        reason: 'no_usable_window',
        explanation: 'Aucune fenêtre libre trouvée pour relancer cette tâche.',
        suggestedNextAction: 'wait',
        confidence: 80
      })
      continue
    }

    const fits = windows.map(window => ({
      window,
      fit: calculateWindowFit({ candidate, window, now: input.now })
    })).filter(w => w.fit.canFit)

    if (fits.length === 0) {
      unplacedItems.push({
        targetType: candidate.targetType,
        targetId: candidate.targetId,
        reason: 'no_usable_window',
        explanation: 'Les fenêtres libres ne correspondent pas.',
        suggestedNextAction: 'wait',
        confidence: 80
      })
      continue
    }

    // Best fit
    fits.sort((a, b) => b.fit.fitScore - a.fit.fitScore)
    const bestMatch = fits[0]
    if (!bestMatch) continue

    // Override size rules for recovery
    // If it's a stagnant objective without next action, mode is manual_review (handled by adapter)
    // If it's an avoided heavy task, we enforce a short relaunch block
    let mode = candidate.placementModeHint ?? 'minimum_viable'
    
    // Check if the candidate reasons contain keywords about being vague, heavy or avoided
    const isAvoided = candidate.targetStatus === 'avoided' || candidate.targetStatus === 'stagnant'
    const isTooHeavy = candidate.recommendedMinutes > 90 && candidate.riskLevel === 'high'

    if (isAvoided || isTooHeavy) {
      // Force a short minimum viable or manual review block to just break the stagnation
      mode = 'minimum_viable'
    }

    // Force constraints on the candidate for calculation
    const recoveryCandidate = { ...candidate }
    if (isAvoided || isTooHeavy) {
      recoveryCandidate.recommendedMinutes = Math.min(candidate.recommendedMinutes, 25)
      recoveryCandidate.maximumSafeMinutes = 45 // Don't overwhelm
      recoveryCandidate.requiresDeepWork = false // Lower the bar to get started
    }

    const size = calculateProposedBlockSize({
      candidate: recoveryCandidate,
      window: bestMatch.window,
      fit: bestMatch.fit,
      placementMode: mode
    })

    if (size.durationMinutes <= 0) continue

    let kind: PlacementBlockKind = 'recovery'
    if (candidate.targetType === 'objective' && mode === 'manual_review') {
      kind = 'review'
    } else if (mode === 'manual_review' || isTooHeavy) {
      kind = 'short_action' // Short action to clarify/split
    } else {
      kind = 'practice' // Or simple short action
    }

    // Create block
    let start = bestMatch.window.start
    let end = ''
    try {
      const d = new Date(start)
      if (!isNaN(d.getTime())) {
        d.setMinutes(d.getMinutes() + size.durationMinutes)
        end = d.toISOString()
      } else {
        end = `${start}_plus_${size.durationMinutes}m`
      }
    } catch {
      end = `${start}_plus_${size.durationMinutes}m`
    }

    const proposedBlock: ProposedPlacementBlock = {
      id: generateId(),
      targetType: candidate.targetType,
      targetId: candidate.targetId,
      kind,
      title: `${candidate.title} (Relance)`,
      date: start.split('T')[0] || 'unknown-date',
      start,
      end,
      durationMinutes: size.durationMinutes,
      sourceWindowId: bestMatch.window.id,
      linkedTaskId: candidate.targetType === 'task' ? candidate.targetId : undefined,
      linkedObjectiveId: candidate.targetType === 'objective' ? candidate.targetId : undefined,
      placementMode: mode,
      priorityScore: candidate.priorityScore,
      confidence: bestMatch.fit.fitScore,
      locked: false,
      reasons: [...bestMatch.fit.reasons, 'Bloc de relance court pour rompre la stagnation.'],
      warnings: [...bestMatch.fit.warnings]
    }

    const validation = validateProposedBlock({
      block: proposedBlock,
      planningContext,
      existingProposedBlocks: proposedBlocks,
      candidate: recoveryCandidate
    })

    if (validation.valid) {
      proposedBlocks.push(proposedBlock)
      usedWindowIds.push(bestMatch.window.id)
    } else {
      unplacedItems.push({
        targetType: candidate.targetType,
        targetId: candidate.targetId,
        reason: 'unknown',
        explanation: 'Échec de la validation du bloc de recovery: ' + validation.reasons.join(', '),
        suggestedNextAction: 'manual_review',
        confidence: 80
      })
    }
  }

  return { proposedBlocks, unplacedItems }
}
