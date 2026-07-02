import type { PlacementCandidate, ProposedPlacementBlock, UnplacedPlacementItem, PlacementBlockKind } from '@shared/placement-model'
import type { AnyPlanningContextV2 } from './placement-window-selector'
import type { AnyDeadlineCrisisContext } from './placement-input-adapter'
import { selectCandidateWindows } from './placement-window-selector'
import { calculateWindowFit } from './task-fit-engine'
import { calculateProposedBlockSize } from './block-sizing-engine'
import { validateProposedBlock } from './placement-constraint-engine'

export interface BuildDeadlineCrisisPlacementPlanInput {
  candidates: PlacementCandidate[]
  deadlineCrisisContexts: AnyDeadlineCrisisContext[]
  planningContext: AnyPlanningContextV2 & { lockedBlocks?: Array<{ start: string; end: string; type: string }> }
  userModel?: unknown
  now?: string
  idFactory?: () => string
}

export interface PlacementStrategyResult {
  proposedBlocks: ProposedPlacementBlock[]
  unplacedItems: UnplacedPlacementItem[]
}

export function buildDeadlineCrisisPlacementPlan(input: BuildDeadlineCrisisPlacementPlanInput): PlacementStrategyResult {
  const { candidates, deadlineCrisisContexts, planningContext, idFactory } = input
  
  const proposedBlocks: ProposedPlacementBlock[] = []
  const unplacedItems: UnplacedPlacementItem[] = []
  const usedWindowIds: string[] = []

  let blockCounter = 1
  const generateId = idFactory ?? (() => `block-c-${Date.now()}-${blockCounter++}`)

  const contextMap = new Map(deadlineCrisisContexts.map(c => [c.targetId, c]))

  // Sort by urgency, then priority
  const sortedCandidates = [...candidates].sort((a, b) => {
    // Basic sort. In a real system we'd check actionPriorityScore or urgencyLevel.
    return b.priorityScore - a.priorityScore
  })

  for (const candidate of sortedCandidates) {
    const crisis = contextMap.get(candidate.targetId)
    if (!crisis) continue // Fallback, though we expect candidates here to have crisis

    const mode = crisis.recommendedMode

    if (mode === 'manual_review') {
      unplacedItems.push({
        targetType: candidate.targetType,
        targetId: candidate.targetId,
        reason: 'low_confidence',
        explanation: 'Données insuffisantes pour créer un plan de crise automatique. Revue manuelle requise.',
        suggestedNextAction: 'manual_review',
        confidence: 90
      })
      continue
    }

    // Windows selection
    const windows = selectCandidateWindows({ candidate, planningContext, usedWindowIds })
    
    if (windows.length === 0) {
      unplacedItems.push({
        targetType: candidate.targetType,
        targetId: candidate.targetId,
        reason: 'deadline_impossible',
        explanation: 'Aucune fenêtre utilisable avant la deadline.',
        suggestedNextAction: 'reschedule_deadline',
        confidence: 95
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
        reason: 'deadline_impossible',
        explanation: 'Temps insuffisant dans les fenêtres restantes avant deadline.',
        suggestedNextAction: 'reduce_scope',
        confidence: 90
      })
      continue
    }

    fits.sort((a, b) => b.fit.fitScore - a.fit.fitScore)
    const bestMatch = fits[0]
    if (!bestMatch) continue

    // Determine size
    const size = calculateProposedBlockSize({
      candidate,
      window: bestMatch.window,
      fit: bestMatch.fit,
      placementMode: mode === 'normal_plan' ? 'normal' : mode === 'intensive_plan' ? 'intensive' : mode === 'minimum_viable_plan' ? 'minimum_viable' : 'rescue'
    })

    if (size.durationMinutes <= 0) continue

    // Determine strategy block kind based on signals, not parsed reasons
    let kind: PlacementBlockKind = 'work'
    
    if (mode === 'rescue_plan') {
      const explicitStrategy = crisis.recommendedStrategy?.strategyType
      if (explicitStrategy === 'practice' || explicitStrategy === 'review' || explicitStrategy === 'diagnostic' || explicitStrategy === 'summary' || explicitStrategy === 'high_yield') {
        kind = explicitStrategy
      } else {
        kind = 'high_yield' // Default rescue action
      }
    } else if (mode === 'minimum_viable_plan') {
      kind = 'high_yield'
    } else if (candidate.requiresDeepWork) {
      kind = 'deep_work'
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
      title: `${candidate.title} (${mode})`,
      date: start.split('T')[0] || 'unknown-date',
      start,
      end,
      durationMinutes: size.durationMinutes,
      sourceWindowId: bestMatch.window.id,
      linkedTaskId: candidate.targetType === 'task' ? candidate.targetId : undefined,
      linkedObjectiveId: candidate.targetType === 'objective' ? candidate.targetId : undefined,
      placementMode: size.durationMinutes < candidate.recommendedMinutes ? 'minimum_viable' : (mode === 'normal_plan' ? 'normal' : mode === 'intensive_plan' ? 'intensive' : mode === 'minimum_viable_plan' ? 'minimum_viable' : 'rescue'),
      priorityScore: candidate.priorityScore,
      confidence: bestMatch.fit.fitScore,
      locked: false,
      reasons: [...bestMatch.fit.reasons, size.reason],
      warnings: [...bestMatch.fit.warnings, ...size.warnings]
    }

    if (mode === 'minimum_viable_plan' || crisis.crisisLevel === 'impossible_full_completion') {
      proposedBlock.warnings.push('Plan complet irréaliste. Seul le minimum viable est proposé.')
      // Add unplaced item for the rest of the task
      unplacedItems.push({
        targetType: candidate.targetType,
        targetId: candidate.targetId,
        reason: 'capacity_exceeded',
        explanation: 'Le reste de la tâche ne peut pas être complété avant la deadline.',
        suggestedNextAction: 'reduce_scope',
        confidence: 90
      })
    }

    const validation = validateProposedBlock({
      block: proposedBlock,
      planningContext,
      existingProposedBlocks: proposedBlocks,
      candidate
    })

    if (validation.valid) {
      proposedBlocks.push(proposedBlock)
      usedWindowIds.push(bestMatch.window.id)
    } else {
      unplacedItems.push({
        targetType: candidate.targetType,
        targetId: candidate.targetId,
        reason: 'unknown',
        explanation: 'Échec de la validation du bloc de crise: ' + validation.reasons.join(', '),
        suggestedNextAction: 'manual_review',
        confidence: 80
      })
    }
  }

  return { proposedBlocks, unplacedItems }
}
