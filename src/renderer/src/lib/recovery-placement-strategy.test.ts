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

  it('propose une relance courte pour une tâche stagnante (pas punitive)', () => {
    const stagnantCandidate: PlacementCandidate = {
      id: 'c3',
      targetType: 'task',
      targetId: 't3',
      title: 'Stagnant Task',
      remainingMinutes: 180,
      minimumUsefulMinutes: 30,
      recommendedMinutes: 90,
      maximumSafeMinutes: 180,
      requiresDeepWork: false,
      canSplit: true,
      canUseShortGap: false,
      shouldAvoidLateNight: false,
      priorityScore: 65,
      targetStatus: 'stagnant',
      riskLevel: 'high',
      reasons: [],
      warnings: [],
      confidence: 100,
    }

    const result = buildRecoveryPlacementPlan({
      candidates: [stagnantCandidate],
      planningContext: context,
      idFactory: () => 'fixed-id',
    })

    expect(result.proposedBlocks).toHaveLength(1)
    const block = result.proposedBlocks[0]!
    // Le but est de relancer, pas d'écraser : pas de bloc énorme punitif.
    expect(block.durationMinutes).toBeLessThanOrEqual(45)
  })

  it('propose split/clarify pour une tâche trop lourde plutôt qu\'un bloc massif', () => {
    const tooHeavyCandidate: PlacementCandidate = {
      id: 'c4',
      targetType: 'task',
      targetId: 't4',
      title: 'Overwhelming Task',
      remainingMinutes: 480,
      minimumUsefulMinutes: 30,
      recommendedMinutes: 120,
      maximumSafeMinutes: 240,
      requiresDeepWork: false,
      canSplit: true,
      canUseShortGap: false,
      shouldAvoidLateNight: false,
      priorityScore: 60,
      targetStatus: 'active',
      riskLevel: 'high',
      reasons: [],
      warnings: [],
      confidence: 100,
    }

    const result = buildRecoveryPlacementPlan({
      candidates: [tooHeavyCandidate],
      planningContext: context,
      idFactory: () => 'fixed-id',
    })

    expect(result.proposedBlocks).toHaveLength(1)
    const block = result.proposedBlocks[0]!
    // Une tâche trop lourde reçoit un bloc court (short_action) pour la clarifier/découper,
    // jamais un bloc qui correspondrait à la durée recommandée complète.
    expect(block.durationMinutes).toBeLessThanOrEqual(45)
    expect(['short_action', 'practice']).toContain(block.kind)
  })

  it('ne mute jamais les candidates passés en paramètre', () => {
    const candidates: PlacementCandidate[] = [
      {
        id: 'c1',
        targetType: 'task',
        targetId: 't1',
        title: 'Task',
        remainingMinutes: 120,
        minimumUsefulMinutes: 30,
        recommendedMinutes: 60,
        maximumSafeMinutes: 120,
        requiresDeepWork: false,
        canSplit: true,
        canUseShortGap: true,
        shouldAvoidLateNight: false,
        priorityScore: 70,
        targetStatus: 'avoided',
        reasons: [],
        warnings: [],
        confidence: 100,
      },
    ]
    const original = JSON.parse(JSON.stringify(candidates))
    buildRecoveryPlacementPlan({ candidates, planningContext: context, idFactory: () => 'fixed-id' })
    expect(candidates).toEqual(original)
  })
})
