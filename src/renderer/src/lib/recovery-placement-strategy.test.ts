import { describe, expect, it } from 'vitest'
import { buildRecoveryPlacementPlan } from './recovery-placement-strategy'
import type { PlacementCandidate } from '@shared/placement-model'
import type { AnyPlanningContextV2 } from './placement-window-selector'

describe('recovery-placement-strategy', () => {
  const context: AnyPlanningContextV2 = {
    usableFreeWindows: [
      { id: 'w1', start: '2026-06-25T10:00:00Z', end: '2026-06-25T12:00:00Z', usableDurationMinutes: 120, canHostTask: true, canHostDeepWork: true, windowType: 'normal' }
    ]
  }

  it('proposes short block for avoided heavy task', () => {
    const avoidedCandidate: PlacementCandidate = {
      id: 'c1',
      targetType: 'task',
      targetId: 't1',
      title: 'Heavy Avoided Task',
      remainingMinutes: 240,
      minimumUsefulMinutes: 30,
      recommendedMinutes: 120,
      maximumSafeMinutes: 180,
      requiresDeepWork: true,
      canSplit: true,
      canUseShortGap: false,
      shouldAvoidLateNight: false,
      priorityScore: 80,
      targetStatus: 'avoided',
      riskLevel: 'high',
      reasons: [],
      warnings: [],
      confidence: 100,
    }

    const result = buildRecoveryPlacementPlan({
      candidates: [avoidedCandidate],
      planningContext: context
    })

    expect(result.proposedBlocks).toHaveLength(1)
    const block = result.proposedBlocks[0]!
    
    // Instead of giving it 120 mins as recommended, the recovery strategy cuts it down significantly to get started.
    expect(block.durationMinutes).toBeLessThanOrEqual(45)
    expect(block.reasons.some(r => r.includes('Relance') || r.includes('relance'))).toBe(true)
  })

  it('proposes short review block for stagnant objective without next action', () => {
    const objectiveCandidate: PlacementCandidate = {
      id: 'c2',
      targetType: 'objective',
      targetId: 'o1',
      title: 'Stagnant Objective',
      remainingMinutes: 30,
      minimumUsefulMinutes: 15,
      recommendedMinutes: 30,
      maximumSafeMinutes: 60,
      requiresDeepWork: false,
      canSplit: true,
      canUseShortGap: true,
      shouldAvoidLateNight: false,
      priorityScore: 70,
      reasons: [],
      warnings: [],
      confidence: 100,
      placementModeHint: 'manual_review'
    }

    const result = buildRecoveryPlacementPlan({
      candidates: [objectiveCandidate],
      planningContext: context
    })

    expect(result.proposedBlocks).toHaveLength(1)
    const block = result.proposedBlocks[0]!
    expect(block.kind).toBe('review')
    expect(block.durationMinutes).toBeLessThanOrEqual(30)
  })
})
