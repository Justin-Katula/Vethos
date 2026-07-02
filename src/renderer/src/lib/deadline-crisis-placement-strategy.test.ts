import { describe, expect, it } from 'vitest'
import { buildDeadlineCrisisPlacementPlan } from './deadline-crisis-placement-strategy'
import type { PlacementCandidate } from '@shared/placement-model'
import type { AnyDeadlineCrisisContext } from './placement-input-adapter'
import type { AnyPlanningContextV2 } from './placement-window-selector'

describe('deadline-crisis-placement-strategy', () => {
  const baseCandidate: PlacementCandidate = {
    id: 'c1',
    targetType: 'task',
    targetId: 't1',
    title: 'Crisis Task',
    remainingMinutes: 120,
    minimumUsefulMinutes: 30,
    recommendedMinutes: 60,
    maximumSafeMinutes: 120,
    requiresDeepWork: false,
    canSplit: true,
    canUseShortGap: true,
    shouldAvoidLateNight: false,
    priorityScore: 90,
    reasons: [],
    warnings: [],
    confidence: 100,
  }

  const context: AnyPlanningContextV2 = {
    usableFreeWindows: [
      { id: 'w1', start: '2026-06-25T10:00:00Z', end: '2026-06-25T12:00:00Z', usableDurationMinutes: 120, canHostTask: true, canHostDeepWork: true, windowType: 'normal' }
    ]
  }

  it('proposes intensive plan when enough time', () => {
    const crisis: AnyDeadlineCrisisContext = {
      targetId: 't1',
      crisisLevel: 'critical',
      recommendedMode: 'intensive_plan'
    }

    const result = buildDeadlineCrisisPlacementPlan({
      candidates: [baseCandidate],
      deadlineCrisisContexts: [crisis],
      planningContext: context
    })

    expect(result.proposedBlocks).toHaveLength(1)
    expect(result.unplacedItems).toHaveLength(0)
    expect(result.proposedBlocks[0]!.title).toContain('intensive_plan')
  })

  it('proposes minimum viable plan and adds unplaced item', () => {
    const crisis: AnyDeadlineCrisisContext = {
      targetId: 't1',
      crisisLevel: 'impossible_full_completion',
      recommendedMode: 'minimum_viable_plan'
    }

    const result = buildDeadlineCrisisPlacementPlan({
      candidates: [baseCandidate],
      deadlineCrisisContexts: [crisis],
      planningContext: context
    })

    expect(result.proposedBlocks).toHaveLength(1)
    expect(result.proposedBlocks[0]!.kind).toBe('high_yield')
    expect(result.unplacedItems).toHaveLength(1) // Emits unplaced item for the rest of the work
    expect(result.unplacedItems[0]!.reason).toBe('capacity_exceeded')
  })

  it('uses structured signals instead of text parsing', () => {
    const crisis: AnyDeadlineCrisisContext = {
      targetId: 'exam_task',
      crisisLevel: 'critical',
      recommendedMode: 'rescue_plan',
      recommendedStrategy: { strategyType: 'practice' }
    }

    const candidate = { ...baseCandidate, targetId: 'exam_task' }

    const result = buildDeadlineCrisisPlacementPlan({
      candidates: [candidate],
      deadlineCrisisContexts: [crisis],
      planningContext: context
    })

    expect(result.proposedBlocks).toHaveLength(1)
    expect(result.proposedBlocks[0]!.kind).toBe('practice') // Derived from reasons, not 'exam'
  })

  it('fails safely if data is missing', () => {
    const crisis: AnyDeadlineCrisisContext = {
      targetId: 't1',
      crisisLevel: 'none',
      recommendedMode: 'manual_review'
    }

    const result = buildDeadlineCrisisPlacementPlan({
      candidates: [baseCandidate],
      deadlineCrisisContexts: [crisis],
      planningContext: context
    })

    expect(result.proposedBlocks).toHaveLength(0)
    expect(result.unplacedItems).toHaveLength(1)
    expect(result.unplacedItems[0]!.reason).toBe('low_confidence')
  })
})
