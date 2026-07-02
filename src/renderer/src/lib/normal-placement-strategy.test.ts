import { describe, expect, it } from 'vitest'
import { buildNormalPlacementPlan } from './normal-placement-strategy'
import type { PlacementCandidate } from '@shared/placement-model'
import type { AnyPlanningContextV2 } from './placement-window-selector'

describe('normal-placement-strategy', () => {
  const c1: PlacementCandidate = {
    id: 'c1',
    targetType: 'task',
    targetId: 't1',
    title: 'High Priority Task',
    remainingMinutes: 60,
    minimumUsefulMinutes: 30,
    recommendedMinutes: 60,
    maximumSafeMinutes: 120,
    requiresDeepWork: true,
    canSplit: true,
    canUseShortGap: false,
    shouldAvoidLateNight: false,
    priorityScore: 90,
    planningPriorityScore: 95,
    reasons: [],
    warnings: [],
    confidence: 100,
  }

  const c2: PlacementCandidate = {
    id: 'c2',
    targetType: 'task',
    targetId: 't2',
    title: 'Low Priority Task',
    remainingMinutes: 30,
    minimumUsefulMinutes: 15,
    recommendedMinutes: 30,
    maximumSafeMinutes: 60,
    requiresDeepWork: false,
    canSplit: true,
    canUseShortGap: true,
    shouldAvoidLateNight: false,
    priorityScore: 40,
    planningPriorityScore: 40,
    reasons: [],
    warnings: [],
    confidence: 100,
  }

  const context: AnyPlanningContextV2 = {
    usableFreeWindows: [
      { id: 'w1', start: '2026-06-25T10:00:00Z', end: '2026-06-25T12:00:00Z', usableDurationMinutes: 120, canHostTask: true, canHostDeepWork: true, windowType: 'normal' },
      { id: 'w2', start: '2026-06-25T14:00:00Z', end: '2026-06-25T14:30:00Z', usableDurationMinutes: 30, canHostTask: true, canHostDeepWork: false, windowType: 'short' }
    ]
  }

  it('places tasks by priority and respects daily capacity', () => {
    const result = buildNormalPlacementPlan({
      candidates: [c2, c1], // Unordered
      planningContext: context,
      idFactory: () => 'fixed-id'
    })

    expect(result.proposedBlocks).toHaveLength(2)
    // c1 has higher priority, should be placed in w1
    const block1 = result.proposedBlocks.find(b => b.targetId === 't1')
    expect(block1).toBeDefined()
    expect(block1?.sourceWindowId).toBe('w1')
    expect(block1?.kind).toBe('deep_work')

    const block2 = result.proposedBlocks.find(b => b.targetId === 't2')
    expect(block2).toBeDefined()
    expect(block2?.sourceWindowId).toBe('w2') // Since w1 is used by c1
    expect(block2?.kind).toBe('short_action')
  })

  it('returns unplaced items if no window available', () => {
    const contextNoWindows: AnyPlanningContextV2 = { usableFreeWindows: [] }
    const result = buildNormalPlacementPlan({
      candidates: [c1],
      planningContext: contextNoWindows
    })
    
    expect(result.proposedBlocks).toHaveLength(0)
    expect(result.unplacedItems).toHaveLength(1)
    expect(result.unplacedItems[0]!.reason).toBe('needs_deep_work_but_no_deep_window')
  })

  it('vague tasks are not placed as deep work', () => {
    const vagueCandidate: PlacementCandidate = {
      ...c1,
      placementModeHint: 'manual_review',
      requiresDeepWork: false
    }
    
    const result = buildNormalPlacementPlan({
      candidates: [vagueCandidate],
      planningContext: context
    })
    
    expect(result.proposedBlocks[0]!.kind).toBe('manual_review')
  })
})
