import { describe, expect, it } from 'vitest'
import type { Objective, Task } from '@shared/schemas'
import { buildObjectivePriorityResult, buildTaskPriorityResult, selectPrimaryObjectiveId } from './priority-engine'

const TODAY = '2026-06-24'

function task(over: Partial<Task> = {}): Task {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Préparer le chapitre',
    linkedObjectiveId: null,
    deadline: '2026-06-25',
    deadlineImpact: 'recoverable',
    complexity: 'hard',
    estimatedMinutes: 300,
    remainingMinutes: 260,
    level: 7,
    status: 'active',
    createdAt: '2026-06-18T12:00:00.000Z',
    ...over,
  }
}

function objective(over: Partial<Objective> = {}): Objective {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Réussir la session',
    description: 'Objectif important',
    color: '#22c55e',
    linkedRuleIds: [],
    level: 7,
    status: 'active',
    createdAt: '2026-06-01T12:00:00.000Z',
    ...over,
  }
}

describe('priority-engine', () => {
  it('analyse une tâche avec deadline demain et beaucoup de temps restant', () => {
    const result = buildTaskPriorityResult(task(), null, {
      todayStr: TODAY,
      todayStartMinute: 9 * 60,
    })

    expect(result.urgencyScore).toBeGreaterThanOrEqual(80)
    expect(result.reasonTags).toContain('deadline_soon')
    expect(result.reasonTags).toContain('large_remaining_work')
    expect(result.reasonTags).toContain('high_complexity')
    expect(result.priorityScore).toBeGreaterThan(50)
  })

  it('utilise le ratio temps restant / temps libre quand il est disponible', () => {
    const result = buildTaskPriorityResult(task({ remainingMinutes: 240 }), null, {
      todayStr: TODAY,
      usableFreeMinutesBeforeDeadline: 200,
    })

    expect(result.urgencyScore).toBe(100)
    expect(result.reasonTags).toContain('limited_free_time')
    expect(result.debug.deadlineRiskRatio).toBeGreaterThanOrEqual(1.2)
  })

  it('reconnaît une tâche presque terminée sans la rendre agressive', () => {
    const result = buildTaskPriorityResult(
      task({ estimatedMinutes: 300, remainingMinutes: 20, complexity: 'normal' }),
      null,
      { todayStr: TODAY },
    )

    expect(result.reasonTags).toContain('almost_completed')
    expect(result.workloadScore).toBeLessThan(20)
    expect(result.momentumScore).toBeGreaterThanOrEqual(60)
  })

  it('analyse un objectif important avec tâches liées', () => {
    const linked = [
      task({
        id: '33333333-3333-4333-8333-333333333333',
        linkedObjectiveId: '22222222-2222-4222-8222-222222222222',
      }),
      task({
        id: '44444444-4444-4444-8444-444444444444',
        linkedObjectiveId: '22222222-2222-4222-8222-222222222222',
        deadline: '2026-06-28',
        remainingMinutes: 180,
      }),
    ]

    const result = buildObjectivePriorityResult(objective(), linked, { todayStr: TODAY })

    expect(result.reasonTags).toContain('active_objective')
    expect(result.reasonTags).toContain('high_objective_value')
    expect(result.reasonTags).toContain('large_objective_scope')
    expect(result.valueScore).toBeGreaterThanOrEqual(85)
    expect(result.priorityScore).toBeGreaterThan(45)
  })

  it('sélectionne et valorise un objectif principal réel', () => {
    const secondary = objective({ id: '55555555-5555-4555-8555-555555555555', level: 4 })
    const primaryId = selectPrimaryObjectiveId([secondary, objective()])
    expect(primaryId).toBe(objective().id)
    const linked = task({ linkedObjectiveId: objective().id })
    const normal = buildTaskPriorityResult(linked, objective(), { todayStr: TODAY })
    const primary = buildTaskPriorityResult(linked, objective(), { todayStr: TODAY, primaryObjectiveId: objective().id })
    expect(primary.valueScore).toBeGreaterThan(normal.valueScore)
  })
})
