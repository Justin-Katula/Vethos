import { describe, it, expect } from 'vitest'
import type { Objective, Task } from '@shared/schemas'
import { buildItems, enumerateDates, distributeBudget, placeBlocks, computePlacement, summarizeDailyLoad, canChangeFreeTimeLevel, daysUntilFreeTimeLevelChange, type PlacedBlock } from './placement-engine'

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

describe('placeBlocks', () => {
  const taskItem = (refId: string, deadline: string | null) => ({
    kind: 'task' as const,
    refId,
    score: 1,
    deadline,
    linkedTaskId: null,
  })

  it('place les blocs dans les créneaux libres, planning vide = journée libre', () => {
    const blocks = placeBlocks(
      [taskItem('t1', null)],
      new Map([['task:t1', 120]]),
      ['2026-05-18'],
      [],
      [],
    )
    const total = blocks.reduce((s, b) => s + (b.endMinute - b.startMinute), 0)
    expect(total).toBe(120)
    expect(blocks.every((b) => b.date === '2026-05-18' && b.kind === 'task')).toBe(true)
  })

  it('ne place jamais une tâche après son échéance', () => {
    const blocks = placeBlocks(
      [taskItem('t1', '2026-05-18')],
      new Map([['task:t1', 120]]),
      ['2026-05-18', '2026-05-19', '2026-05-20'],
      [],
      [],
    )
    expect(blocks.length).toBeGreaterThan(0)
    expect(blocks.every((b) => b.date <= '2026-05-18')).toBe(true)
  })

  it('étale les blocs d un item sur plusieurs jours', () => {
    const blocks = placeBlocks(
      [taskItem('t1', null)],
      new Map([['task:t1', 600]]),
      ['2026-05-18', '2026-05-19', '2026-05-20', '2026-05-21', '2026-05-22'],
      [],
      [],
    )
    expect(new Set(blocks.map((b) => b.date)).size).toBeGreaterThan(1)
  })

  it('ne place pas l item temps libre (il est ce qui reste)', () => {
    const blocks = placeBlocks(
      [{ kind: 'free', refId: null, score: 5, deadline: null, linkedTaskId: null }],
      new Map([['free', 300]]),
      ['2026-05-18'],
      [],
      [],
    )
    expect(blocks).toEqual([])
  })
})

describe('computePlacement', () => {
  const base = {
    objectives: [],
    rules: [],
    entries: [],
    freeTimeLevel: 5,
    todayStr: '2026-05-18',
    rangeEndStr: '2026-05-24',
  }

  it('produit des blocs datés dans la plage', () => {
    const blocks = computePlacement({
      ...base,
      tasks: [makeTask({ id: 't1', level: 6, deadline: '2026-12-31', linkedObjectiveId: null })],
    })
    expect(blocks.length).toBeGreaterThan(0)
    expect(blocks.every((b) => b.date >= '2026-05-18' && b.date <= '2026-05-24')).toBe(true)
    expect(blocks.every((b) => b.kind === 'task')).toBe(true)
  })

  it('renvoie [] sans tâche ni objectif (seul le temps libre concourt)', () => {
    expect(computePlacement({ ...base, tasks: [] })).toEqual([])
  })

  it('est déterministe : mêmes entrées ⇒ même plan', () => {
    const input = {
      ...base,
      tasks: [makeTask({ id: 't1', level: 6, deadline: '2026-12-31', linkedObjectiveId: null })],
    }
    expect(computePlacement(input)).toEqual(computePlacement(input))
  })
})

describe('summarizeDailyLoad', () => {
  it('calcule temps travaillé et temps libre restant par jour', () => {
    const blocks: PlacedBlock[] = [
      {
        id: 'x',
        date: '2026-05-18',
        startMinute: 0,
        endMinute: 120,
        kind: 'task',
        refId: 't1',
        linkedTaskId: null,
      },
    ]
    const load = summarizeDailyLoad(blocks, ['2026-05-18', '2026-05-19'], [], [])
    expect(load[0]).toEqual({ date: '2026-05-18', workedMinutes: 120, freeMinutes: 1440 - 120 })
    expect(load[1]).toEqual({ date: '2026-05-19', workedMinutes: 0, freeMinutes: 1440 })
  })
})

describe('canChangeFreeTimeLevel', () => {
  it('autorise si jamais changé', () => {
    expect(canChangeFreeTimeLevel(undefined, new Date('2026-05-18T00:00:00.000Z'))).toBe(true)
  })

  it('refuse avant 14 jours', () => {
    expect(
      canChangeFreeTimeLevel('2026-05-10T00:00:00.000Z', new Date('2026-05-18T00:00:00.000Z')),
    ).toBe(false)
  })

  it('autorise à partir de 14 jours', () => {
    expect(
      canChangeFreeTimeLevel('2026-05-01T00:00:00.000Z', new Date('2026-05-18T00:00:00.000Z')),
    ).toBe(true)
  })
})

describe('daysUntilFreeTimeLevelChange', () => {
  it('compte les jours restants avant déverrouillage', () => {
    expect(
      daysUntilFreeTimeLevelChange('2026-05-10T00:00:00.000Z', new Date('2026-05-18T00:00:00.000Z')),
    ).toBe(6)
  })

  it('renvoie 0 si jamais changé', () => {
    expect(daysUntilFreeTimeLevelChange(undefined, new Date('2026-05-18T00:00:00.000Z'))).toBe(0)
  })
})

describe('placeBlocks — plafond par jour', () => {
  it('ne place pas plus de 240 min du même item sur un seul jour', () => {
    const blocks = placeBlocks(
      [{ kind: 'task' as const, refId: 't1', score: 1, deadline: null, linkedTaskId: null }],
      new Map([['task:t1', 1000]]),
      ['2026-05-18'],
      [],
      [],
    )
    const total = blocks.reduce((s, b) => s + (b.endMinute - b.startMinute), 0)
    expect(total).toBe(240)
  })
})

describe('distributeBudget — total non multiple de 5', () => {
  it('le total distribué égale exactement totalFreeMinutes', () => {
    const item = (refId: string) => ({
      kind: 'task' as const,
      refId,
      score: 1,
      deadline: null,
      linkedTaskId: null,
    })
    const budgets = distributeBudget([item('a'), item('b'), item('c')], 83)
    const total = [...budgets.values()].reduce((s, v) => s + v, 0)
    expect(total).toBe(83)
  })
})
