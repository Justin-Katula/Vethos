import type { PlacementCandidate, ProposedPlacementBlock, UnplacedPlacementItem, PlacementMode, PlacementBlockKind } from '@shared/placement-model'
import type { AnyPlanningContextV2 } from './placement-window-selector'
import { selectCandidateWindows } from './placement-window-selector'
import { calculateWindowFit } from './task-fit-engine'
import { calculateProposedBlockSize } from './block-sizing-engine'
import { validateProposedBlock } from './placement-constraint-engine'

export interface BuildNormalPlacementPlanInput {
  candidates: PlacementCandidate[]
  planningContext: AnyPlanningContextV2 & { lockedBlocks?: Array<{ start: string; end: string; type: string }> }
  priorityScoresV2?: unknown[]
  userModel?: unknown
  now?: string
  idFactory?: () => string
}

export interface PlacementStrategyResult {
  proposedBlocks: ProposedPlacementBlock[]
  unplacedItems: UnplacedPlacementItem[]
}

export function buildNormalPlacementPlan(input: BuildNormalPlacementPlanInput): PlacementStrategyResult {
  const { candidates, planningContext, idFactory } = input
  
  const proposedBlocks: ProposedPlacementBlock[] = []
  const unplacedItems: UnplacedPlacementItem[] = []
  const usedWindowIds: string[] = []

  let blockCounter = 1
  const generateId = idFactory ?? (() => `block-n-${Date.now()}-${blockCounter++}`)

  // 1. Sort candidates (planningPriorityScore DESC, then actionPriorityScore DESC, then priorityScore DESC)
  const sortedCandidates = [...candidates].sort((a, b) => {
    if ((a.planningPriorityScore ?? -1) !== (b.planningPriorityScore ?? -1)) {
      return (b.planningPriorityScore ?? -1) - (a.planningPriorityScore ?? -1)
    }
    if ((a.actionPriorityScore ?? -1) !== (b.actionPriorityScore ?? -1)) {
      return (b.actionPriorityScore ?? -1) - (a.actionPriorityScore ?? -1)
    }
    return b.priorityScore - a.priorityScore
  })

  // We should track daily capacity. For now, we'll just track total proposed minutes
  // and stop if we reach a reasonable maximum (e.g. 8 hours = 480 mins) to avoid 100% fill.
  let totalProposedMinutes = 0
  const MAX_DAILY_MINUTES = 480 

  for (const candidate of sortedCandidates) {
    if (totalProposedMinutes >= MAX_DAILY_MINUTES) {
      unplacedItems.push({
        targetType: candidate.targetType,
        targetId: candidate.targetId,
        reason: 'capacity_exceeded',
        explanation: 'Capacité journalière maximale atteinte. Impossible de placer plus de blocs.',
        suggestedNextAction: 'wait',
        confidence: 90
      })
      continue
    }

    // a. Select compatible windows
    const windows = selectCandidateWindows({ candidate, planningContext, usedWindowIds })
    
    if (windows.length === 0) {
      unplacedItems.push({
        targetType: candidate.targetType,
        targetId: candidate.targetId,
        reason: candidate.requiresDeepWork ? 'needs_deep_work_but_no_deep_window' : 'no_usable_window',
        explanation: 'Aucune fenêtre libre compatible n\'a été trouvée pour cette tâche.',
        suggestedNextAction: 'wait',
        confidence: 80
      })
      continue
    }

    // b. Calculate fit scores
    const fits = windows.map(window => ({
      window,
      fit: calculateWindowFit({ candidate, window, now: input.now })
    })).filter(w => w.fit.canFit)

    if (fits.length === 0) {
      unplacedItems.push({
        targetType: candidate.targetType,
        targetId: candidate.targetId,
        reason: 'no_usable_window',
        explanation: 'Les fenêtres libres ne correspondent pas aux critères minimaux de la tâche.',
        suggestedNextAction: 'wait',
        confidence: 80
      })
      continue
    }

    // c. Choose best window
    fits.sort((a, b) => b.fit.fitScore - a.fit.fitScore)
    const bestMatch = fits[0]
    if (!bestMatch) continue

    // d. Calculate proposed duration
    const size = calculateProposedBlockSize({
      candidate,
      window: bestMatch.window,
      fit: bestMatch.fit,
      placementMode: candidate.placementModeHint ?? 'normal'
    })

    if (size.durationMinutes <= 0) {
      unplacedItems.push({
        targetType: candidate.targetType,
        targetId: candidate.targetId,
        reason: 'unknown',
        explanation: 'Erreur lors du calcul de la durée du bloc.',
        suggestedNextAction: 'manual_review',
        confidence: 50
      })
      continue
    }

    // Calculate a simple start/end string (very naive ISO date manipulation for shadow placement)
    // Assume window.start is like '2026-06-25T10:00:00Z', we just add minutes.
    // To keep it pure and simple without complex date libraries, we'll simulate it by returning
    // start = window.start, and end = window.start + duration (in a pseudo format)
    // In a real app we'd use date-fns. For the engine rules, we just need start/end to be comparable.
    let start = bestMatch.window.start
    let end = ''
    try {
      const d = new Date(start)
      if (!isNaN(d.getTime())) {
        d.setMinutes(d.getMinutes() + size.durationMinutes)
        end = d.toISOString()
      } else {
        // Fallback if not standard ISO
        end = `${start}_plus_${size.durationMinutes}m`
      }
    } catch {
      end = `${start}_plus_${size.durationMinutes}m`
    }

    let kind: PlacementBlockKind = 'work'
    if (candidate.placementModeHint === 'manual_review') {
      kind = 'manual_review'
    } else if (candidate.requiresDeepWork) {
      kind = 'deep_work'
    } else if (size.durationMinutes <= 30) {
      kind = 'short_action'
    }

    // e. Create block
    const proposedBlock: ProposedPlacementBlock = {
      id: generateId(),
      targetType: candidate.targetType,
      targetId: candidate.targetId,
      kind,
      title: candidate.title,
      date: start.split('T')[0] || 'unknown-date',
      start,
      end,
      durationMinutes: size.durationMinutes,
      sourceWindowId: bestMatch.window.id,
      linkedTaskId: candidate.targetType === 'task' ? candidate.targetId : undefined,
      linkedObjectiveId: candidate.targetType === 'objective' ? candidate.targetId : undefined,
      placementMode: candidate.placementModeHint ?? 'normal',
      priorityScore: candidate.priorityScore,
      confidence: bestMatch.fit.fitScore, // We use fitScore as confidence in the placement quality
      locked: false,
      reasons: [...bestMatch.fit.reasons, size.reason],
      warnings: [...bestMatch.fit.warnings, ...size.warnings]
    }

    // f. Validate block
    const validation = validateProposedBlock({
      block: proposedBlock,
      planningContext,
      existingProposedBlocks: proposedBlocks,
      candidate
    })

    // g. Add if valid
    if (validation.valid) {
      proposedBlocks.push(proposedBlock)
      usedWindowIds.push(bestMatch.window.id)
      totalProposedMinutes += size.durationMinutes
    } else {
      unplacedItems.push({
        targetType: candidate.targetType,
        targetId: candidate.targetId,
        reason: 'unknown',
        explanation: 'Le bloc proposé n\'a pas passé les contraintes finales: ' + validation.reasons.join(', '),
        suggestedNextAction: 'wait',
        confidence: 80
      })
    }
  }

  return { proposedBlocks, unplacedItems }
}
