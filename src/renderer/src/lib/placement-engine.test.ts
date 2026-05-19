import { describe, it, expect } from 'vitest'
import type { Objective, Task } from '@shared/schemas'
import { buildItems, enumerateDates, distributeBudget } from './placement-engine'

export function makeTask(over: Partial<Task> & { id: string }): Task {
  return {
    id: over.id,
    title: over.title ?? 'Tâche',
    linkedObjectiveId: over.linkedObjectiveId ?? null,
    deadline: over.deadline ?? '2026-12-31',
    level: over.level ?? 5,
    degradationPool: over.degradationPool ?? 0,
    totalDegradation: over.totalDegradation ?? 0,
    status: over.status ?? 'active',
    createdAt: over.createdAt ?? '2026-01-01T00:00:00.000Z',
  }
}

export function makeObjective(over: Partial<Objective> & { id: string }): Objective {
  return {
    id: over.id,
    name: over.name ?? 'Objectif',
    color: over.color ?? '#3BA3FF',
    linkedRuleIds: over.linkedRuleIds ?? [],
    level: over.level ?? 5,
    createdAt: over.createdAt ?? '2026-01-01T00:00:00.000Z',
  }
}

describe('enumerateDates', () => {
  it('liste les dates incluses entre début et fin', () => {
    expect(enumerateDates('2026-05-18', '2026-05-20')).toEqual([
      '2026-05-18',
      '2026-05-19',
      '2026-05-20',
    ])
  })

  it('renvoie un seul jour si début === fin', () => {
    expect(enumerateDates('2026-05-18', '2026-05-18')).toEqual(['2026-05-18'])
  })
})

describe('buildItems', () => {
  it('score une tâche autonome par niveau × multiplicateur', () => {
    const items = buildItems(
      [makeTask({ id: 't1', level: 6, deadline: '2026-12-31', linkedObjectiveId: null })],
      [],
      5,
      '2026-05-18',
    )
    expect(items.find((i) => i.kind === 'task' && i.refId === 't1')?.score).toBe(6)
  })

  it('combine objectif + tâches liées puis divise par 1,5', () => {
    const items = buildItems(
      [
        makeTask({ id: 'a', level: 7, deadline: '2026-12-31', linkedObjectiveId: 'o1' }),
        makeTask({ id: 'b', level: 7, deadline: '2026-12-31', linkedObjectiveId: 'o1' }),
      ],
      [makeObjective({ id: 'o1', level: 5 })],
      5,
      '2026-05-18',
    )
    expect(items.find((i) => i.kind === 'objective')?.score).toBeCloseTo((5 + 7 + 7) / 1.5)
  })

  it('ajoute un item temps libre dont le score = niveau de temps libre', () => {
    const items = buildItems([], [], 6, '2026-05-18')
    expect(items.find((i) => i.kind === 'free')?.score).toBe(6)
  })

  it('exclut les tâches de niveau 0 et les tâches non actives', () => {
    const items = buildItems(
      [
        makeTask({ id: 'z', level: 0, linkedObjectiveId: null }),
        makeTask({ id: 'h', level: 5, status: 'history', linkedObjectiveId: null }),
      ],
      [],
      5,
      '2026-05-18',
    )
    expect(items.some((i) => i.kind === 'task')).toBe(false)
  })
})

describe('distributeBudget', () => {
  const item = (refId: string, score: number) => ({
    kind: 'task' as const,
    refId,
    score,
    deadline: null,
    linkedTaskId: null,
  })

  it('répartit proportionnellement au score, arrondi à 5 min', () => {
    const budgets = distributeBudget([item('t1', 3), item('t2', 1)], 400)
    expect(budgets.get('task:t1')).toBe(300)
    expect(budgets.get('task:t2')).toBe(100)
  })

  it('verse le reliquat d arrondi pour que le total = T', () => {
    const budgets = distributeBudget([item('a', 1), item('b', 1), item('c', 1)], 80)
    const total = [...budgets.values()].reduce((s, v) => s + v, 0)
    expect(total).toBe(80)
  })

  it('renvoie une map vide si le temps libre total est nul', () => {
    expect(distributeBudget([item('t1', 3)], 0).size).toBe(0)
  })
})
