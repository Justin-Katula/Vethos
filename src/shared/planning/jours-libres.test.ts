import { describe, it, expect } from 'vitest'
import { computePlan } from './engine'
import { jourLibrePropose, messageJourLibre } from './jours-libres'
import { sleepScheduleEntries } from '@shared/sleep'
import { addDays } from './dates'
import type { ObjectiveItem, PlanningInput, SessionEvent, TaskItem } from './types'

// Lundi 21 septembre 2026, 8 h.
const NOW = new Date(2026, 8, 21, 8, 0)
const TODAY = '2026-09-21'
const OBJ = 'aaaaaaaa-1111-4111-8111-111111111111'

const objectif: ObjectiveItem = {
  id: OBJ,
  name: 'Guitare',
  plan: 'Plan de test pour objectif',
  color: '#3ECF8E',
  weeklyTargetMinutes: 180,
  appsToBlock: [],
  createdAt: '2026-06-01T10:00:00.000Z',
}

/** 25 démarrages à l'heure, spontanés : une habitude installée (phase 3+). */
const installee = (refId: string): SessionEvent[] =>
  Array.from({ length: 25 }, (_, i) => ({
    blockId: `h${i}`,
    date: addDays(TODAY, -(i + 1)),
    kind: 'objective',
    refId,
    category: `objectif:${refId}`,
    plannedStartMinute: 10 * 60,
    plannedMinutes: 30,
    started: true,
    delayMinutes: 0,
    spontaneous: true,
    heldMinutes: 30,
    stoppedEarly: false,
    blockedAttempts: 0,
    load48hMinutes: 0,
    createdAt: '2026-09-01T10:00:00.000Z',
  }))

const input = (over: Partial<PlanningInput> = {}): PlanningInput => ({
  today: TODAY,
  rangeEnd: '2026-09-27',
  tasks: [],
  objectives: [objectif],
  ancres: [],
  schedule: sleepScheduleEntries('23:00', '07:00'),
  observations: [],
  anchorMissCounts: {},
  dailyUtilization: {},
  weeklyObjectiveServed: {},
  objectiveLastServed: {},
  lastSignalAt: {},
  tasksCreatedPerWeek: {},
  consecutiveDelays: {},
  sessionEvents: installee(OBJ),
  ...over,
})

const proposer = (inp: PlanningInput, freeDays: Record<string, 'taken' | 'kept'> = {}) =>
  jourLibrePropose({
    input: inp,
    learning: { freeDays, sessionEvents: inp.sessionEvents ?? [] },
    plan: computePlan(inp, NOW),
    now: NOW,
  })

describe('Jours libres', () => {
  it('habitude installée et semaine légère : un jour est proposé, et le moteur le vide', () => {
    const jour = proposer(input())
    expect(jour).not.toBeNull()
    const plan = computePlan(input({ freeDays: [jour!] }), NOW)
    expect(plan.blocks.filter((b) => b.date === jour && b.kind !== 'ancre')).toEqual([])
    expect(messageJourLibre('2026-09-26')).toBe('Saturday is free.')
  })

  it('jamais tant que l’habitude du jour n’est pas en phase 3 ou 4', () => {
    expect(proposer(input({ sessionEvents: installee(OBJ).slice(0, 5) }))).toBeNull()
  })

  it('un seul par semaine, et un jour gardé ne se repropose pas', () => {
    expect(proposer(input(), { '2026-09-23': 'taken' })).toBeNull()
    const jour = proposer(input())!
    expect(proposer(input(), { [jour]: 'kept' })).not.toBe(jour)
  })

  it('jamais si le recalcul montre qu’une tâche en souffrirait', () => {
    const tache: TaskItem = {
      id: 'bbbbbbbb-1111-4111-8111-111111111111',
      title: 'Rapport',
      plan: 'Plan de test pour tâche',
      deadline: '2026-09-27',
      importance: 5,
      category: 'général',
      workKind: 'routine',
      estimatedMinutes: 2400,
      remainingMinutes: 2400,
      correctionFactor: 1,
      parentTaskId: null,
      partOrder: null,
      extraMinutes: 0,
      status: 'active',
      appsToBlock: [],
      createdAt: '2026-09-01T10:00:00.000Z',
    }
    expect(proposer(input({ tasks: [tache] }))).toBeNull()
  })
})
