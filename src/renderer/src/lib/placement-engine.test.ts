import { describe, it, expect } from 'vitest'
import type { Objective, ScheduleEntry, Task, TimeRule } from '@shared/schemas'
import {
  buildItems,
  clampPlanningRangeEnd,
  computePlacement,
  computePlacementPlan,
  computeStaticTomorrowPlacementPlan,
  distributeBudget,
  enumerateDates,
  placeBlocks,
  summarizeDailyLoad,
  type PlacedBlock,
  type PlacementItem,
} from './placement-engine'

const TODAY = '2026-05-18' // lundi
const NOW = '2026-01-01T00:00:00.000Z'

export function makeTask(over: Partial<Task> & { id: string }): Task {
  return {
    id: over.id,
    title: over.title ?? 'Tâche',
    linkedObjectiveId: over.linkedObjectiveId ?? null,
    deadline: over.deadline ?? '2026-12-31',
    deadlineTime: over.deadlineTime,
    deadlineImpact: over.deadlineImpact,
    complexity: over.complexity,
    estimatedMinutes: over.estimatedMinutes,
    remainingMinutes: over.remainingMinutes,
    level: over.level ?? 5,
    status: over.status ?? 'active',
    createdAt: over.createdAt ?? NOW,
    blocking: over.blocking,
    devForceDate: over.devForceDate,
    devForceStartMinute: over.devForceStartMinute,
    devForceEndMinute: over.devForceEndMinute,
  }
}

export function makeObjective(over: Partial<Objective> & { id: string }): Objective {
  return {
    id: over.id,
    name: over.name ?? 'Objectif',
    color: over.color ?? '#3BA3FF',
    linkedRuleIds: over.linkedRuleIds ?? [],
    level: over.level ?? 5,
    status: over.status ?? 'active',
    createdAt: over.createdAt ?? NOW,
    blocking: over.blocking,
  }
}

function fixedRule(): TimeRule {
  return {
    id: 'fixed',
    name: 'Travail',
    color: '#3BA3FF',
    categoryType: 'work',
    linkedProfileId: null,
    createdAt: NOW,
  }
}

function commitmentRule(id = 'commitment'): TimeRule {
  return {
    id,
    name: 'Engagement',
    color: '#6B7280',
    categoryType: 'commitment',
    linkedProfileId: null,
    createdAt: NOW,
  }
}

function schoolRule(): TimeRule {
  return {
    id: 'school',
    name: 'École',
    color: '#3BA3FF',
    categoryType: 'school',
    linkedProfileId: null,
    createdAt: NOW,
  }
}

function mondayFreeMinutes(minutes: number): { rules: TimeRule[]; entries: ScheduleEntry[] } {
  if (minutes >= 1440) return { rules: [], entries: [] }
  const rule = fixedRule()
  return {
    rules: [rule],
    entries: [
      {
        id: 'busy',
        ruleId: rule.id,
        dayOfWeek: 0,
        startMinute: minutes,
        endMinute: 1440,
        createdAt: NOW,
      },
    ],
  }
}

function baseInput(over: {
  tasks?: Task[]
  objectives?: Objective[]
  freeMinutesToday?: number
} = {}) {
  const schedule = mondayFreeMinutes(over.freeMinutesToday ?? 1440)
  return {
    tasks: over.tasks ?? [],
    objectives: over.objectives ?? [],
    rules: schedule.rules,
    entries: schedule.entries,
    todayStr: TODAY,
    rangeEndStr: TODAY,
  }
}

function item(
  refId: string,
  score: number,
  dailyCapMinutes = 1000,
  level = 5,
  requiredMinutes: number | null = null,
): PlacementItem {
  return {
    kind: 'task',
    refId,
    score,
    label: refId,
    level,
    deadline: null,
    deadlineTime: null,
    deadlineImpact: null,
    dailyCapMinutes,
    requiredMinutes,
    availableBeforeDeadlineMinutes: null,
    status: 'planifiable',
    linkedTaskId: null,
    linkedTaskIds: [],
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
    expect(enumerateDates(TODAY, TODAY)).toEqual([TODAY])
  })
})

describe('clampPlanningRangeEnd', () => {
  it('borne le planning à une fenêtre glissante de 7 jours', () => {
    expect(clampPlanningRangeEnd(TODAY, '2026-06-30')).toBe('2026-05-24')
  })

  it('accepte une fenêtre plus longue quand elle est demandée explicitement', () => {
    expect(clampPlanningRangeEnd(TODAY, '2026-06-30', 44)).toBe('2026-06-30')
  })

  it('conserve une fin de plage plus courte que 7 jours', () => {
    expect(clampPlanningRangeEnd(TODAY, '2026-05-20')).toBe('2026-05-20')
  })
})

describe('buildItems', () => {
  it('score une tâche autonome avec niveau × deadline × complexité', () => {
    const items = buildItems(
      [
        makeTask({
          id: 't1',
          level: 6,
          deadline: '2026-12-31',
          complexity: 'easy',
          linkedObjectiveId: null,
        }),
      ],
      [],
      TODAY,
    )
    expect(items.find((i) => i.kind === 'task' && i.refId === 't1')?.score).toBe(6)
  })

  it('une deadline passée sort du planning actif', () => {
    const items = buildItems(
      [
        makeTask({
          id: 'late',
          level: 5,
          deadline: '2026-05-10',
          complexity: 'easy',
          linkedObjectiveId: null,
        }),
      ],
      [],
      TODAY,
    )
    expect(items.find((i) => i.refId === 'late')).toBeUndefined()
  })

  it('la complexité augmente le score à niveau et deadline égaux', () => {
    const items = buildItems(
      [
        makeTask({
          id: 'normal',
          level: 5,
          deadline: '2026-05-19',
          deadlineImpact: 'recoverable',
          complexity: 'normal',
          linkedObjectiveId: null,
        }),
        makeTask({
          id: 'complex',
          level: 5,
          deadline: '2026-05-19',
          deadlineImpact: 'hard',
          complexity: 'hard',
          linkedObjectiveId: null,
        }),
      ],
      [],
      TODAY,
    )
    expect(items.find((i) => i.refId === 'complex')!.score).toBeGreaterThan(
      items.find((i) => i.refId === 'normal')!.score,
    )
  })

  it('un objectif seul utilise /1.7 et jamais de multiplicateur d échéance', () => {
    const items = buildItems([], [makeObjective({ id: 'o1', level: 5 })], TODAY)
    expect(items.find((i) => i.kind === 'objective')?.score).toBeCloseTo(5 / 1.7)
  })

  it('une tâche liée renforce son objectif mais n est pas un item placé seul', () => {
    const items = buildItems(
      [
        makeTask({
          id: 'linked',
          level: 7,
          deadline: '2026-05-19',
          deadlineImpact: 'hard',
          complexity: 'easy',
          linkedObjectiveId: 'o1',
        }),
      ],
      [makeObjective({ id: 'o1', level: 5 })],
      TODAY,
    )
    expect(items.some((i) => i.kind === 'task')).toBe(false)
    expect(items.find((i) => i.kind === 'objective')?.linkedTaskIds).toEqual(['linked'])
    expect(items.find((i) => i.kind === 'objective')?.score).toBeCloseTo((5 + 14) / 1.7)
  })

  it('ne garde qu une tâche active prioritaire dans la file d un objectif', () => {
    const items = buildItems(
      [
        makeTask({
          id: 'quick',
          level: 1,
          deadline: '2026-05-19',
          complexity: 'easy',
          linkedObjectiveId: 'o1',
        }),
        makeTask({
          id: 'deep',
          level: 10,
          deadline: '2026-05-24',
          complexity: 'hard',
          linkedObjectiveId: 'o1',
        }),
      ],
      [makeObjective({ id: 'o1', level: 5 })],
      TODAY,
    )
    const objective = items.find((i) => i.kind === 'objective')!
    expect(objective.linkedTaskId).toBe('deep')
    expect(objective.linkedTaskIds).toEqual(['deep'])
    expect(items.some((i) => i.kind === 'task')).toBe(false)
  })

  it('exclut les tâches de niveau 0, expirées ou complétées', () => {
    const items = buildItems(
      [
        makeTask({ id: 'z', level: 0, linkedObjectiveId: null }),
        makeTask({ id: 'e', level: 5, status: 'expired', linkedObjectiveId: null }),
        makeTask({ id: 'h', level: 5, status: 'completed', linkedObjectiveId: null }),
      ],
      [],
      TODAY,
    )
    expect(items.some((i) => i.kind === 'task')).toBe(false)
  })
})

describe('distributeBudget', () => {
  it('utilise le temps restant déclaré plutôt que le score', () => {
    const budgets = distributeBudget(
      [item('t1', 3, 1000, 5, 180), item('t2', 1, 1000, 5, 60)],
      [TODAY],
    )
    expect(budgets.get('task:t1')).toBe(180)
    expect(budgets.get('task:t2')).toBe(60)
  })

  it('ne coupe plus une tâche à son ancien plafond journalier absolu', () => {
    const budgets = distributeBudget([item('small', 1, 15, 1, 400)], [TODAY])
    expect(budgets.get('task:small')).toBe(400)
  })

  it('renvoie une map vide sans item', () => {
    expect(distributeBudget([], [TODAY]).size).toBe(0)
  })
})

describe('placeBlocks', () => {
  it('conserve une pause obligatoire entre les sprints d une tâche à deadline critique', () => {
    const urgent = {
      ...item('urgent', 10, 240, 8, 180),
      deadlineImpact: 'hard' as const,
    }
    const blocks = placeBlocks(
      [urgent],
      new Map([['task:urgent', 180]]),
      [TODAY],
      [],
      [],
      { includeRecoveryBlocks: true, todayStr: TODAY },
    )
    const work = blocks.filter((block) => block.kind === 'task')
    expect(work.every((block) => block.endMinute - block.startMinute <= 90)).toBe(true)
    expect(blocks.some((block) => block.kind === 'break')).toBe(true)
  })
  it('place les blocs dans les créneaux libres', () => {
    const blocks = placeBlocks(
      [item('t1', 1, 120)],
      new Map([['task:t1', 120]]),
      [TODAY],
      [],
      [],
    )
    const total = blocks.reduce((s, b) => s + (b.endMinute - b.startMinute), 0)
    expect(total).toBe(120)
    expect(blocks.every((b) => b.date === TODAY && b.kind === 'task')).toBe(true)
  })

  it('reprend le même item après une pause obligatoire d une heure', () => {
    const blocks = placeBlocks(
      [item('t1', 1, 60)],
      new Map([['task:t1', 480]]),
      [TODAY],
      [],
      [],
    )
    const total = blocks.reduce((s, b) => s + (b.endMinute - b.startMinute), 0)
    expect(total).toBe(480)
    const sorted = blocks.slice().sort((a, b) => a.startMinute - b.startMinute)
    expect(sorted.some((block, index) => {
      if (index === 0) return false
      return block.startMinute - sorted[index - 1]!.endMinute >= 60
    })).toBe(true)
  })

  it('ne place pas de pause récupératrice après le dernier bloc de travail', () => {
    const deep = { ...item('deep', 1, 1000, 10, 120), isDeepWork: true }
    const blocks = placeBlocks(
      [deep],
      new Map([['task:deep', 120]]),
      [TODAY],
      [],
      [],
      { includeRecoveryBlocks: true },
    )
    expect(blocks.some((block) => block.kind === 'break')).toBe(false)
    expect(blocks.reduce((sum, block) => sum + (block.endMinute - block.startMinute), 0)).toBe(120)
  })

  it('place une pause récupératrice seulement quand un autre bloc suit', () => {
    const deep = { ...item('deep', 2, 1000, 10, 120), isDeepWork: true }
    const next = { ...item('next', 1, 1000, 10, 120), isDeepWork: true }
    const blocks = placeBlocks(
      [deep, next],
      new Map([
        ['task:deep', 120],
        ['task:next', 120],
      ]),
      [TODAY],
      [],
      [],
      { includeRecoveryBlocks: true },
    )
    const recovery = blocks.filter((block) => block.kind === 'break')
    const workBlocks = blocks.filter((block) => block.kind === 'task')
    expect(recovery).toHaveLength(1)
    expect(workBlocks).toHaveLength(2)
    expect(recovery[0]!.startMinute).toBe(workBlocks[0]!.endMinute)
    expect(workBlocks[1]!.startMinute).toBeGreaterThanOrEqual(recovery[0]!.endMinute)
  })

  it('consolide la pause majeure avec les buffers courts déjà pris', () => {
    const blocks = placeBlocks(
      [
        { ...item('deep1', 3, 1000, 10, 120), isDeepWork: true },
        { ...item('deep2', 2, 1000, 10, 120), isDeepWork: true },
        { ...item('deep3', 1, 1000, 10, 120), isDeepWork: true },
      ],
      new Map([
        ['task:deep1', 120],
        ['task:deep2', 120],
        ['task:deep3', 120],
      ]),
      [TODAY],
      [],
      [],
      { includeRecoveryBlocks: true },
    )
    const breakDurations = blocks
      .filter((block) => block.kind === 'break')
      .map((block) => block.endMinute - block.startMinute)

    expect(breakDurations).toContain(15)
    expect(breakDurations).toContain(45)
  })
})

describe('computePlacementPlan', () => {
  it('une tâche niveau 1 seule avec deadline lointaine ne reçoit pas deux heures', () => {
    const plan = computePlacementPlan(
      {
        ...baseInput({
        tasks: [
          makeTask({
            id: 'tiny',
            level: 1,
            deadline: '2026-06-30',
            complexity: 'easy',
            linkedObjectiveId: null,
          }),
        ],
        }),
        rangeEndStr: '2026-05-24',
      },
    )
    const tiny = plan.diagnostics.items.find((i) => i.refId === 'tiny')!
    expect(tiny.rawBudgetMinutes).toBe(30)
    expect(tiny.cappedMinutes).toBe(30)
    expect(tiny.placeableMinutes).toBe(30)
    expect(tiny.placedMinutes).toBe(30)
    expect(plan.blocks).toHaveLength(2)
    expect(plan.blocks.every((block) => block.endMinute - block.startMinute === 15)).toBe(true)
  })

  it('laisse tout le temps vide en temps libre réel quand aucun item actif n existe', () => {
    const plan = computePlacementPlan(baseInput({ freeMinutesToday: 1000 }))
    expect(plan.diagnostics.totalFreeMinutes).toBe(1000)
    expect(plan.diagnostics.plannedMinutes).toBe(0)
    expect(plan.diagnostics.unplannedMinutes).toBe(1000)
  })

  it('sépare clairement raw, capped, placeable, placed et unplanned', () => {
    const plan = computePlacementPlan(
      baseInput({
        freeMinutesToday: 300,
        objectives: [makeObjective({ id: 'o7', level: 7 })],
      }),
    )
    const objective = plan.diagnostics.items.find((i) => i.refId === 'o7')!
    expect(objective.rawBudgetMinutes).toBe(120)
    expect(objective.cappedMinutes).toBe(120)
    expect(objective.placeableMinutes).toBe(120)
    expect(objective.placedMinutes).toBe(120)
    expect(objective.unplannedMinutes).toBe(0)
    expect(plan.diagnostics.unplannedMinutes).toBe(180)
  })

  it('plafonne un objectif par jour selon la table 3 à 7', () => {
    const expected = new Map([
      [3, 30],
      [4, 45],
      [5, 60],
      [6, 90],
      [7, 120],
    ])

    for (const [level, minutes] of expected) {
      const plan = computePlacementPlan(
        baseInput({
          objectives: [makeObjective({ id: `o${level}`, level })],
        }),
      )
      const objective = plan.diagnostics.items.find((i) => i.refId === `o${level}`)!
      expect(objective.cappedMinutes).toBe(minutes)
      expect(objective.placeableMinutes).toBe(minutes)
      expect(objective.placedMinutes).toBe(minutes)
      expect(plan.blocks.reduce((sum, b) => sum + (b.endMinute - b.startMinute), 0)).toBe(minutes)
    }
  })

  it('réserve le cap quotidien des objectifs sur toute la fenêtre sans le diluer par score', () => {
    const plan = computePlacementPlan(
      {
        ...baseInput({
          objectives: [makeObjective({ id: 'o3', level: 3 })],
        }),
        rangeEndStr: '2026-05-24',
      },
    )
    const objective = plan.diagnostics.items.find((i) => i.refId === 'o3')!
    expect(objective.rawBudgetMinutes).toBe(210)
    expect(objective.cappedMinutes).toBe(210)
    expect(objective.placeableMinutes).toBe(210)
    expect(objective.placedMinutes).toBe(210)
    expect(plan.blocks).toHaveLength(7)
    expect(plan.blocks.every((block) => block.endMinute - block.startMinute === 30)).toBe(true)
  })

  it('objectif niveau 7 seul place 120 minutes, pas un budget théorique trompeur', () => {
    const plan = computePlacementPlan(
      baseInput({
        freeMinutesToday: 300,
        objectives: [makeObjective({ id: 'o7', level: 7 })],
      }),
    )
    const objective = plan.diagnostics.items.find((i) => i.refId === 'o7')!
    expect(objective.placedMinutes).toBe(120)
    expect(plan.blocks).toHaveLength(1)
    expect(plan.blocks[0]!.endMinute - plan.blocks[0]!.startMinute).toBe(120)
  })

  it('place le bloc de l objectif, pas la tâche liée seule', () => {
    const plan = computePlacementPlan(
      baseInput({
        tasks: [
          makeTask({
            id: 'linked',
            level: 8,
            deadline: '2026-05-19',
            linkedObjectiveId: 'o1',
            complexity: 'easy',
          }),
        ],
        objectives: [makeObjective({ id: 'o1', level: 5 })],
      }),
    )
    expect(plan.blocks.length).toBeGreaterThan(0)
    expect(plan.blocks.every((block) => block.kind === 'objective')).toBe(true)
    expect(plan.blocks.every((block) => block.linkedTaskIds.includes('linked'))).toBe(true)
    expect(plan.diagnostics.items.some((item) => item.kind === 'task')).toBe(false)
    expect(plan.diagnostics.items.find((item) => item.refId === 'o1')?.rawBudgetMinutes).toBe(540)
    expect(plan.diagnostics.items.find((item) => item.refId === 'o1')?.cappedMinutes).toBe(240)
    expect(plan.diagnostics.items.find((item) => item.refId === 'o1')?.placedMinutes).toBe(240)
  })

  it('bloque les 30 minutes après le réveil déclaré', () => {
    const blocks = computePlacement({
      ...baseInput({
        tasks: [
          makeTask({
            id: 'morning',
            level: 10,
            deadline: '2026-05-19',
            remainingMinutes: 120,
            linkedObjectiveId: null,
          }),
        ],
      }),
      wakeMinute: 7 * 60,
    })
    expect(blocks.length).toBeGreaterThan(0)
    expect(blocks.every((block) => block.startMinute >= 7 * 60 + 30)).toBe(true)
  })

  it('attend 30 minutes après travail/école avant de placer une tâche', () => {
    const work = fixedRule()
    const blocks = computePlacement({
      ...baseInput({
        tasks: [
          makeTask({
            id: 'after-work',
            level: 10,
            deadline: '2026-05-19',
            remainingMinutes: 60,
            linkedObjectiveId: null,
          }),
        ],
      }),
      rules: [work],
      entries: [
        {
          id: 'workday',
          ruleId: work.id,
          dayOfWeek: 0,
          startMinute: 0,
          endMinute: 17 * 60,
          createdAt: NOW,
        },
      ],
    })
    expect(blocks.length).toBeGreaterThan(0)
    expect(blocks[0]!.startMinute).toBeGreaterThanOrEqual(17 * 60 + 30)
  })

  it('garde le couvre-feu 21h quand la charge tient dans les règles biologiques', () => {
    const busy = commitmentRule()
    const plan = computePlacementPlan({
      tasks: [
        makeTask({
          id: 'evening',
          level: 10,
          deadline: '2026-05-19',
          remainingMinutes: 60,
          linkedObjectiveId: null,
        }),
      ],
      objectives: [],
      rules: [busy],
      entries: [
        { id: 'busy-before', ruleId: busy.id, dayOfWeek: 0, startMinute: 0, endMinute: 20 * 60, createdAt: NOW },
        { id: 'busy-after', ruleId: busy.id, dayOfWeek: 0, startMinute: 22 * 60, endMinute: 1440, createdAt: NOW },
      ],
      todayStr: TODAY,
      rangeEndStr: TODAY,
    })

    expect(plan.diagnostics.cognitivePolicy).toBe('baseline')
    expect(plan.blocks.every((block) => block.endMinute <= 21 * 60)).toBe(true)
  })

  it('relaxe le couvre-feu à 22h seulement quand la deadline ne rentre pas à 21h', () => {
    const busy = commitmentRule()
    const plan = computePlacementPlan({
      tasks: [
        makeTask({
          id: 'urgent-evening',
          level: 10,
          deadline: '2026-05-19',
          remainingMinutes: 120,
          linkedObjectiveId: null,
        }),
      ],
      objectives: [],
      rules: [busy],
      entries: [
        { id: 'busy-before', ruleId: busy.id, dayOfWeek: 0, startMinute: 0, endMinute: 20 * 60, createdAt: NOW },
        { id: 'busy-after', ruleId: busy.id, dayOfWeek: 0, startMinute: 22 * 60, endMinute: 1440, createdAt: NOW },
      ],
      todayStr: TODAY,
      rangeEndStr: TODAY,
    })

    expect(plan.diagnostics.cognitivePolicy).toBe('curfew-22')
    expect(plan.blocks.reduce((sum, block) => sum + (block.endMinute - block.startMinute), 0)).toBe(120)
    expect(Math.max(...plan.blocks.map((block) => block.endMinute))).toBe(22 * 60)
  })

  it('autorise deux sujets le même soir seulement avec un buffer de 15 minutes', () => {
    const busy = commitmentRule()
    const plan = computePlacementPlan({
      tasks: [
        makeTask({ id: 'maths', level: 10, deadline: '2026-05-19', remainingMinutes: 60 }),
        makeTask({ id: 'physics', level: 9, deadline: '2026-05-19', remainingMinutes: 60 }),
      ],
      objectives: [],
      rules: [busy],
      entries: [
        { id: 'busy-before', ruleId: busy.id, dayOfWeek: 0, startMinute: 0, endMinute: 18 * 60, createdAt: NOW },
        { id: 'busy-after', ruleId: busy.id, dayOfWeek: 0, startMinute: 22 * 60, endMinute: 1440, createdAt: NOW },
      ],
      todayStr: TODAY,
      rangeEndStr: TODAY,
    })
    const work = plan.blocks
      .filter((block) => block.kind === 'task')
      .sort((a, b) => a.startMinute - b.startMinute)

    expect(plan.diagnostics.cognitivePolicy).toBe('two-subjects')
    expect(new Set(work.map((block) => block.refId))).toEqual(new Set(['maths', 'physics']))
    expect(work[1]!.startMinute - work[0]!.endMinute).toBeGreaterThanOrEqual(15)
  })

  it('monte le cap post-école à 240 minutes uniquement en surcharge urgente', () => {
    const school = schoolRule()
    const busy = commitmentRule()
    const plan = computePlacementPlan({
      tasks: [
        makeTask({
          id: 'exam-after-school',
          level: 10,
          deadline: '2026-05-19',
          remainingMinutes: 210,
          linkedObjectiveId: null,
        }),
      ],
      objectives: [],
      rules: [school, busy],
      entries: [
        { id: 'busy-before', ruleId: busy.id, dayOfWeek: 0, startMinute: 0, endMinute: 8 * 60, createdAt: NOW },
        { id: 'school-day', ruleId: school.id, dayOfWeek: 0, startMinute: 8 * 60, endMinute: 14 * 60, createdAt: NOW },
        { id: 'busy-after', ruleId: busy.id, dayOfWeek: 0, startMinute: 18 * 60 + 30, endMinute: 1440, createdAt: NOW },
      ],
      todayStr: TODAY,
      rangeEndStr: TODAY,
    })

    expect(plan.diagnostics.cognitivePolicy).toBe('daily-cap-240')
    expect(plan.blocks.reduce((sum, block) => sum + (block.endMinute - block.startMinute), 0)).toBe(210)
    expect(plan.blocks.every((block) => block.startMinute >= 14 * 60 + 30)).toBe(true)
  })

  it('place le travail hard dans la fenêtre de pic cognitif', () => {
    const blocks = computePlacement({
      ...baseInput({
        tasks: [
          makeTask({
            id: 'deep',
            level: 10,
            deadline: '2026-05-19',
            complexity: 'hard',
            remainingMinutes: 120,
            estimatedMinutes: 120,
            linkedObjectiveId: null,
          }),
        ],
      }),
      wakeMinute: 7 * 60,
      chronotype: 'intermediate',
    })
    expect(blocks[0]).toMatchObject({ refId: 'deep' })
    expect(blocks[0]!.startMinute).toBeGreaterThanOrEqual(9 * 60)
    expect(blocks[0]!.endMinute).toBeLessThanOrEqual(11 * 60)
    expect(blocks[0]!.endMinute - blocks[0]!.startMinute).toBeGreaterThanOrEqual(90)
  })

  it('regroupe les micro-tâches en fin d après-midi avec un cap quotidien de 30 minutes', () => {
    const plan = computePlacementPlan(
      baseInput({
        tasks: [
          makeTask({ id: 'm1', level: 1, deadline: '2026-05-19', remainingMinutes: 15 }),
          makeTask({ id: 'm2', level: 1, deadline: '2026-05-19', remainingMinutes: 15 }),
          makeTask({ id: 'm3', level: 1, deadline: '2026-05-19', remainingMinutes: 15 }),
        ],
      }),
    )
    const total = plan.blocks.reduce((sum, block) => sum + (block.endMinute - block.startMinute), 0)
    expect(total).toBeLessThanOrEqual(30)
    expect(plan.blocks.every((block) => block.startMinute >= 15 * 60)).toBe(true)
  })

  it('génère un snapshot statique du lendemain sans curseur matinal', () => {
    const plan = computeStaticTomorrowPlacementPlan({
      ...baseInput({
        tasks: [
          makeTask({
            id: 'tomorrow',
            level: 10,
            deadline: '2026-05-20',
            remainingMinutes: 120,
            linkedObjectiveId: null,
          }),
        ],
      }),
      todayStartMinute: 20 * 60,
      rangeEndStr: '2026-05-24',
    })
    expect(plan.blocks.length).toBeGreaterThan(0)
    expect(plan.blocks.every((block) => block.date === '2026-05-19')).toBe(true)
    expect(plan.blocks[0]!.startMinute).toBe(0)
  })

  it('place une tâche urgente avant la garantie objectif quand le temps manque', () => {
    const plan = computePlacementPlan(
      baseInput({
        freeMinutesToday: 120,
        tasks: [
          makeTask({
            id: 'urgent',
            level: 10,
            deadline: '2026-05-19',
            deadlineImpact: 'hard',
            complexity: 'hard',
            remainingMinutes: 120,
            estimatedMinutes: 120,
            linkedObjectiveId: null,
          }),
        ],
        objectives: [makeObjective({ id: 'o7', level: 7 })],
      }),
    )
    expect(plan.blocks).toHaveLength(1)
    expect(plan.blocks[0]).toMatchObject({ kind: 'task', refId: 'urgent' })
    expect(plan.blocks[0]!.endMinute - plan.blocks[0]!.startMinute).toBe(120)
    expect(plan.diagnostics.items.find((item) => item.refId === 'urgent')?.placedMinutes).toBe(120)
    expect(plan.diagnostics.items.find((item) => item.refId === 'o7')?.rawBudgetMinutes).toBe(120)
    expect(plan.diagnostics.items.find((item) => item.refId === 'o7')?.placedMinutes).toBe(0)
  })

  it('place la garantie objectif avant une tâche lointaine quand le temps manque', () => {
    const plan = computePlacementPlan(
      baseInput({
        freeMinutesToday: 120,
        tasks: [
          makeTask({
            id: 'later',
            level: 10,
            deadline: '2026-12-31',
            deadlineImpact: 'recoverable',
            remainingMinutes: 120,
            estimatedMinutes: 120,
            linkedObjectiveId: null,
          }),
        ],
        objectives: [makeObjective({ id: 'o7', level: 7 })],
      }),
    )
    expect(plan.blocks).toHaveLength(1)
    expect(plan.blocks[0]).toMatchObject({ kind: 'objective', refId: 'o7' })
    expect(plan.blocks[0]!.endMinute - plan.blocks[0]!.startMinute).toBe(120)
    expect(plan.diagnostics.items.find((item) => item.refId === 'o7')?.placedMinutes).toBe(120)
    expect(plan.diagnostics.items.find((item) => item.refId === 'later')?.placedMinutes).toBe(0)
  })

  it('laisse le temps non utilisé non planifié après plafonds', () => {
    const plan = computePlacementPlan(
      {
        ...baseInput({
        tasks: [
          makeTask({
            id: 'tiny',
            level: 1,
            deadline: '2026-06-30',
            complexity: 'easy',
            linkedObjectiveId: null,
          }),
        ],
        }),
        rangeEndStr: '2026-05-24',
      },
    )
    expect(plan.diagnostics.items.find((i) => i.refId === 'tiny')?.placedMinutes).toBe(30)
    expect(plan.diagnostics.unplannedMinutes).toBe(plan.diagnostics.totalFreeMinutes - 30)
    expect(plan.diagnostics.unplannedMinutes).toBeGreaterThan(0)
  })

  it('une tâche niveau 2 peut créer un bloc court de 20 à 25 minutes', () => {
    const plan = computePlacementPlan(
      {
        ...baseInput({
        tasks: [
          makeTask({
            id: 'small2',
            level: 2,
            deadline: '2026-06-30',
            complexity: 'easy',
            linkedObjectiveId: null,
          }),
        ],
        }),
        rangeEndStr: '2026-05-24',
      },
    )
    const small = plan.diagnostics.items.find((i) => i.refId === 'small2')!
    expect(small.minBlockMinutes).toBe(20)
    expect(small.placedMinutes).toBe(20)
    expect(plan.blocks[0]!.endMinute - plan.blocks[0]!.startMinute).toBe(20)
  })

  it('une tâche niveau 3+ garde un minimum de bloc à 30 minutes', () => {
    const rule = fixedRule()
    const blocks = placeBlocks(
      [item('level3', 1, 35, 3)],
      new Map([['task:level3', 35]]),
      [TODAY],
      [
        {
          id: 'busy',
          ruleId: rule.id,
          dayOfWeek: 0,
          startMinute: 25,
          endMinute: 1440,
          createdAt: NOW,
        },
      ],
      [rule],
    )
    expect(blocks).toHaveLength(0)
  })

  it('détecte un planning impossible quand le temps requis dépasse le disponible', () => {
    const plan = computePlacementPlan(
      baseInput({
        freeMinutesToday: 120,
        tasks: [
          makeTask({
            id: 'exam',
            level: 8,
            deadline: '2026-05-19',
            deadlineImpact: 'hard',
            complexity: 'easy',
            remainingMinutes: 300,
            linkedObjectiveId: null,
          }),
        ],
      }),
    )
    expect(plan.diagnostics.status).toBe('impossible')
    expect(plan.diagnostics.items.find((i) => i.refId === 'exam')?.status).toBe('impossible')
  })

  it('augmente le budget quand une deadline exacte est a moins de 48h', () => {
    const plan = computePlacementPlan({
      tasks: [
        makeTask({
          id: 'urgent-48h',
          level: 8,
          deadline: '2026-05-19',
          deadlineTime: '08:00',
          remainingMinutes: 300,
          estimatedMinutes: 300,
          linkedObjectiveId: null,
        }),
      ],
      objectives: [],
      rules: [],
      entries: [],
      todayStr: TODAY,
      rangeEndStr: '2026-05-19',
      todayStartMinute: 10 * 60,
    })

    const urgent = plan.diagnostics.items.find((i) => i.refId === 'urgent-48h')!
    expect(urgent.rawBudgetMinutes).toBe(300)
    expect(urgent.placedMinutes).toBe(300)
  })

  it('distribue uniformément une tâche lointaine pour limiter la surcharge', () => {
    const plan = computePlacementPlan({
      ...baseInput({
        tasks: [
          makeTask({
            id: 'far-balanced',
            level: 5,
            deadline: '2026-05-25',
            remainingMinutes: 210,
            estimatedMinutes: 210,
            linkedObjectiveId: null,
          }),
        ],
      }),
      rangeEndStr: '2026-05-24',
    })
    const byDate = new Map<string, number>()
    for (const block of plan.blocks) {
      byDate.set(block.date, (byDate.get(block.date) ?? 0) + (block.endMinute - block.startMinute))
    }

    expect([...byDate.values()]).toEqual([30, 30, 30, 30, 30, 30, 30])
  })

  it('retire la dette de sommeil de la capacité maximale du jour de récupération', () => {
    const plan = computePlacementPlan({
      ...baseInput(),
      fatigueRecoveryDate: TODAY,
      fatigueRecoveryMinutes: 120,
    })

    expect(plan.diagnostics.totalFreeMinutes).toBe(21 * 60 - 120)
    expect(plan.diagnostics.fatigueReductionMinutes).toBe(120)
  })

  it('peut placer plus de 4h sur le même item après pause si la deadline l exige', () => {
    const plan = computePlacementPlan({
      ...baseInput({
        tasks: [
          makeTask({
            id: 'urgent-14h',
            title: 'Urgent 14h',
            level: 10,
            deadline: '2026-05-20',
            deadlineImpact: 'hard',
            complexity: 'hard',
            estimatedMinutes: 840,
            remainingMinutes: 840,
            linkedObjectiveId: null,
          }),
        ],
      }),
      rangeEndStr: '2026-05-20',
    })
    const urgentBlocks = plan.blocks.filter((block) => block.refId === 'urgent-14h')
    const total = urgentBlocks.reduce((sum, block) => sum + (block.endMinute - block.startMinute), 0)
    const byDate = new Map<string, PlacedBlock[]>()
    for (const block of urgentBlocks) {
      byDate.set(block.date, [...(byDate.get(block.date) ?? []), block])
    }

    expect(total).toBe(840)
    expect(urgentBlocks.every((block) => block.endMinute - block.startMinute <= 240)).toBe(true)
    expect(urgentBlocks.every((block) => block.endMinute - block.startMinute >= 90)).toBe(true)
    for (const blocks of byDate.values()) {
      const dayTotal = blocks.reduce((sum, block) => sum + (block.endMinute - block.startMinute), 0)
      if (dayTotal <= 240) continue
      const sorted = blocks.slice().sort((a, b) => a.startMinute - b.startMinute)
      expect(sorted.some((block, index) => {
        if (index === 0) return false
        return block.startMinute - sorted[index - 1]!.endMinute >= 60
      })).toBe(true)
    }
  })

  it('réduit la fragmentation des tâches hard proches', () => {
    const plan = computePlacementPlan(
      baseInput({
        freeMinutesToday: 480,
        tasks: [
          makeTask({ id: 'u1', level: 10, deadline: '2026-05-19', deadlineImpact: 'hard' }),
          makeTask({ id: 'u2', level: 9, deadline: '2026-05-19', deadlineImpact: 'hard' }),
          makeTask({ id: 'u3', level: 8, deadline: '2026-05-19', deadlineImpact: 'hard' }),
          makeTask({ id: 'u4', level: 7, deadline: '2026-05-19', deadlineImpact: 'hard' }),
        ],
      }),
    )
    expect(new Set(plan.blocks.map((block) => block.refId)).size).toBeLessThanOrEqual(3)
    expect(plan.blocks.every((block) => block.endMinute - block.startMinute >= 60)).toBe(true)
  })

  it('une deadline passée active ne génère plus de rattrapage', () => {
    const plan = computePlacementPlan(
      baseInput({
        freeMinutesToday: 300,
        tasks: [
          makeTask({
            id: 'late-hard',
            level: 7,
            deadline: '2026-05-17',
            deadlineImpact: 'hard',
            remainingMinutes: 60,
            linkedObjectiveId: null,
          }),
        ],
      }),
    )
    expect(plan.diagnostics.items.find((item) => item.refId === 'late-hard')).toBeUndefined()
    expect(plan.blocks.length).toBe(0)
  })

  it('une deadline hard expirée ne place aucun rattrapage', () => {
    const plan = computePlacementPlan(
      baseInput({
        freeMinutesToday: 300,
        tasks: [
          makeTask({
            id: 'expired-hard',
            level: 7,
            status: 'expired',
            deadline: '2026-05-17',
            deadlineImpact: 'hard',
            remainingMinutes: 60,
            linkedObjectiveId: null,
          }),
        ],
      }),
    )
    expect(plan.diagnostics.items).toHaveLength(0)
    expect(plan.blocks).toHaveLength(0)
  })

  it('limite les blocs générés à la fenêtre glissante de 7 jours', () => {
    const blocks = computePlacement({
      ...baseInput({
        tasks: [
          makeTask({ id: 't1', level: 6, deadline: '2026-12-31', linkedObjectiveId: null }),
        ],
      }),
      rangeEndStr: '2026-06-30',
    })
    expect(blocks.length).toBeGreaterThan(0)
    expect(blocks.every((b) => b.date >= TODAY && b.date <= '2026-05-24')).toBe(true)
  })

  it('peut générer les blocs du mois complet avec une fenêtre explicite', () => {
    const plan = computePlacementPlan({
      ...baseInput({
        objectives: [makeObjective({ id: 'month-objective', level: 3 })],
      }),
      rangeEndStr: '2026-05-31',
      maxPlanningDays: 14,
    })

    const objective = plan.diagnostics.items.find((item) => item.refId === 'month-objective')!
    expect(plan.blocks).toHaveLength(14)
    expect(plan.blocks.every((block) => block.date >= TODAY && block.date <= '2026-05-31')).toBe(true)
    expect(objective.rawBudgetMinutes).toBe(420)
    expect(objective.placedMinutes).toBe(420)
  })

  it('ne génère aucun bloc dans le passé de la journée courante', () => {
    const blocks = computePlacement({
      ...baseInput({
        tasks: [
          makeTask({
            id: 't1',
            title: 'Bloc futur',
            level: 10,
            deadline: '2026-12-31',
            linkedObjectiveId: null,
          }),
        ],
      }),
      rangeEndStr: '2026-05-24',
      todayStartMinute: 13 * 60 + 2,
    })
    expect(blocks.length).toBeGreaterThan(0)
    expect(blocks.every((b) => b.date !== TODAY || b.startMinute >= 13 * 60 + 5)).toBe(true)
  })

  it('produit des blocs enrichis et verrouillés', () => {
    const blocks = computePlacement(
      {
        ...baseInput({
        tasks: [
          makeTask({
            id: 't1',
            title: 'Bloc enrichi',
            level: 10,
            deadline: '2026-12-31',
            linkedObjectiveId: null,
          }),
        ],
        }),
        rangeEndStr: '2026-05-24',
      },
    )
    expect(blocks[0]).toMatchObject({
      kind: 'task',
      refKind: 'task',
      refId: 't1',
      label: 'Bloc enrichi',
      locked: true,
      linkedTaskId: null,
      linkedTaskIds: [],
    })
  })
})

describe('summarizeDailyLoad', () => {
  it('calcule temps travaillé et temps libre restant par jour', () => {
    const blocks: PlacedBlock[] = [
      {
        id: 'x',
        date: TODAY,
        startMinute: 0,
        endMinute: 120,
        kind: 'task',
        refKind: 'task',
        refId: 't1',
        label: 'Tâche',
        locked: true,
        linkedTaskId: null,
        linkedTaskIds: [],
      },
    ]
    const load = summarizeDailyLoad(blocks, [TODAY, '2026-05-19'], [], [])
    expect(load[0]).toEqual({ date: TODAY, workedMinutes: 120, freeMinutes: 21 * 60 - 120 })
    expect(load[1]).toEqual({ date: '2026-05-19', workedMinutes: 0, freeMinutes: 21 * 60 })
  })

  it('calcule le temps libre restant sans compter le passé d aujourd hui', () => {
    const load = summarizeDailyLoad([], [TODAY], [], [], {
      todayStr: TODAY,
      todayStartMinute: 8 * 60 + 1,
    })
    expect(load[0]).toEqual({ date: TODAY, workedMinutes: 0, freeMinutes: 775 })
  })
})

describe('devForce override placement', () => {
  it('places tasks with devForce parameters statically at the specified date and time', () => {
    const task = makeTask({
      id: 'dev-forced-task',
      title: 'Dev Forced Task',
      level: 5,
      deadline: '2026-12-31',
      linkedObjectiveId: null,
      devForceDate: TODAY,
      devForceStartMinute: 600,
      devForceEndMinute: 720,
    })

    const plan = computePlacementPlan({
      ...baseInput({
        tasks: [task],
      }),
      todayStr: TODAY,
      rangeEndStr: TODAY,
    })

    const forcedBlock = plan.blocks.find((b) => b.id === 'dev-force-dev-forced-task')
    expect(forcedBlock).toBeDefined()
    expect(forcedBlock!.date).toBe(TODAY)
    expect(forcedBlock!.startMinute).toBe(600)
    expect(forcedBlock!.endMinute).toBe(720)
    expect(forcedBlock!.kind).toBe('task')
    expect(forcedBlock!.refId).toBe('dev-forced-task')
  })
})
