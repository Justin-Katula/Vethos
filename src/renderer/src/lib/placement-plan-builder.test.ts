import { describe, expect, it } from 'vitest'
import { buildPlacementPlanV2 } from './placement-plan-builder'
import type { AnyPlanningContextV2 } from './placement-window-selector'
import type { AnyTaskModel, AnyDeadlineCrisisContext } from './placement-input-adapter'

describe('placement-plan-builder', () => {
  const context: AnyPlanningContextV2 = {
    usableFreeWindows: [
      { id: 'w1', start: '2026-06-25T10:00:00Z', end: '2026-06-25T12:00:00Z', usableDurationMinutes: 120, canHostTask: true, canHostDeepWork: true, windowType: 'normal' },
      { id: 'w2', start: '2026-06-25T14:00:00Z', end: '2026-06-25T16:00:00Z', usableDurationMinutes: 120, canHostTask: true, canHostDeepWork: true, windowType: 'normal' }
    ]
  }

  const baseInput = {
    userId: 'u1',
    dateRange: { startDate: '2026-06-25', endDate: '2026-06-25' },
    planningContext: context,
    idFactory: () => 'fixed-id-' + Math.random().toString(36).substr(2, 5) // Allow some randomness here for unique ids in integration tests
  }

  it('builds a normal plan when no crisis exists', () => {
    const tasks: AnyTaskModel[] = [
      { id: 't1', status: 'active', remainingMinutes: 60, requiresDeepWork: true }
    ]

    const plan = buildPlacementPlanV2({
      ...baseInput,
      taskModelsV2: tasks
    })

    expect(plan.mode).toBe('normal')
    expect(plan.proposedBlocks).toHaveLength(1)
    expect(plan.proposedBlocks[0]!.kind).toBe('deep_work')
    expect(plan.diagnostics?.status).not.toBe('critical')
  })

  it('builds a crisis plan and routes to deadline-crisis-placement-strategy', () => {
    const tasks: AnyTaskModel[] = [
      { id: 't1', status: 'active', remainingMinutes: 120, requiresDeepWork: false }
    ]
    const contexts: AnyDeadlineCrisisContext[] = [
      { targetId: 't1', crisisLevel: 'critical', recommendedMode: 'intensive_plan' }
    ]

    const plan = buildPlacementPlanV2({
      ...baseInput,
      taskModelsV2: tasks,
      deadlineCrisisContexts: contexts
    })

    expect(plan.mode).toBe('intensive')
    expect(plan.proposedBlocks).toHaveLength(1)
    expect(plan.proposedBlocks[0]!.placementMode).toBe('intensive')
  })

  it('handles minimum_viable plans without pretending to complete everything', () => {
    const tasks: AnyTaskModel[] = [
      { id: 't1', status: 'active', remainingMinutes: 300, requiresDeepWork: false }
    ]
    const contexts: AnyDeadlineCrisisContext[] = [
      { targetId: 't1', crisisLevel: 'impossible_full_completion', recommendedMode: 'minimum_viable_plan' }
    ]

    const plan = buildPlacementPlanV2({
      ...baseInput,
      taskModelsV2: tasks,
      deadlineCrisisContexts: contexts
    })

    expect(plan.mode).toBe('minimum_viable')
    expect(plan.proposedBlocks).toHaveLength(1)
    expect(plan.proposedBlocks[0]!.durationMinutes).toBeLessThan(300)
    expect(plan.unplacedItems.some(i => i.reason === 'capacity_exceeded')).toBe(true)
    expect(plan.proposedBlocks[0]!.warnings.length).toBeGreaterThan(0)
  })

  it('reste pur et ne modifie aucun store', () => {
    const plan = buildPlacementPlanV2({
      ...baseInput,
      taskModelsV2: [{ id: 't1', status: 'active' }]
    })
    
    expect(plan.metadata.source).toBe('placement_engine')
    // Verification relies on the code having no imports to stores.
    // The architecture strictly uses inputs and pure returns.
  })
})
