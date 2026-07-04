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

  it('propose un plan rescue quand le temps est insuffisant', () => {
    const crisis: AnyDeadlineCrisisContext = {
      targetId: 't1',
      crisisLevel: 'rescue_required',
      recommendedMode: 'rescue_plan',
    }

    const result = buildDeadlineCrisisPlacementPlan({
      candidates: [baseCandidate],
      deadlineCrisisContexts: [crisis],
      planningContext: context,
      idFactory: () => 'fixed-id',
    })

    expect(result.proposedBlocks).toHaveLength(1)
    expect(result.proposedBlocks[0]!.placementMode).toBe('rescue')
  })

  it('ne sauvegarde jamais les strategy_blocks comme des tâches réelles', () => {
    // Un strategy_block (practice/high_yield/diagnostic...) est un bloc PROPOSÉ de type
    // stratégie, pas une tâche enregistrée. On vérifie qu'il reste targetType 'task'
    // lié au targetId, et qu'aucune mutation de tâche n'est effectuée par la stratégie.
    const crisis: AnyDeadlineCrisisContext = {
      targetId: 't1',
      crisisLevel: 'rescue_required',
      recommendedMode: 'rescue_plan',
      recommendedStrategy: { strategyType: 'diagnostic' },
    }

    const result = buildDeadlineCrisisPlacementPlan({
      candidates: [{ ...baseCandidate }],
      deadlineCrisisContexts: [crisis],
      planningContext: context,
      idFactory: () => 'fixed-id',
    })

    const block = result.proposedBlocks[0]!
    expect(block.kind).toBe('diagnostic')
    // Le bloc reste un ProposedPlacementBlock (locked false), pas une tâche enregistrée.
    expect(block.locked).toBe(false)
    expect(block.targetType).toBe('task')
    expect(block.targetId).toBe('t1')
  })

  it('protège le sommeil : ne place rien si la seule fenêtre est trop tardive', () => {
    const lateNightContext: AnyPlanningContextV2 = {
      usableFreeWindows: [
        { id: 'w-late', start: '2026-06-25T23:00:00Z', end: '2026-06-26T01:00:00Z', usableDurationMinutes: 120, canHostTask: true, canHostDeepWork: true, windowType: 'normal', isLateNight: true },
      ],
    }
    const crisis: AnyDeadlineCrisisContext = {
      targetId: 't1',
      crisisLevel: 'rescue_required',
      recommendedMode: 'rescue_plan',
    }
    // Candidat qui doit éviter les créneaux tardifs.
    const avoidLateCandidate = { ...baseCandidate, shouldAvoidLateNight: true }

    const result = buildDeadlineCrisisPlacementPlan({
      candidates: [avoidLateCandidate],
      deadlineCrisisContexts: [crisis],
      planningContext: lateNightContext,
      idFactory: () => 'fixed-id',
    })

    // La seule fenêtre étant tardive et protégée, la tâche devient unplaced plutôt que
    // de sacrifier le sommeil.
    expect(result.proposedBlocks).toHaveLength(0)
    expect(result.unplacedItems.length).toBeGreaterThan(0)
  })
})
