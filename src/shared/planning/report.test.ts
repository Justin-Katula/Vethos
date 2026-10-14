import { describe, expect, it } from 'vitest'
import type { LearningState } from '@shared/schemas'
import {
  fenetreSansConfirmation,
  minutesDeRappel,
  noterReport,
  pliesParReport,
  plusTardPermis,
  reportJourneePermis,
  reportsJourneeCetteSemaine,
} from './report'

const vide = {} as LearningState
const bloc = { id: 'task-t1-2026-10-15-840', kind: 'task' as const, startMinute: 840, endMinute: 930 }

describe('Avant de commencer — blocage et rappels', () => {
  it('sans « Je commence », l’écart dure une heure au plus', () => {
    expect(fenetreSansConfirmation(bloc)).toEqual({ debut: 840, fin: 900 })
    expect(fenetreSansConfirmation({ startMinute: 840, endMinute: 870 })).toEqual({ debut: 840, fin: 870 })
  })

  it('un rappel toutes les 3 min, vingt au plus, dans la fenêtre', () => {
    const r = minutesDeRappel(bloc)
    expect(r).toHaveLength(20)
    expect(r[0]).toBe(840)
    expect(r[1]).toBe(843)
    expect(r.at(-1)).toBe(897)
    // Un bloc de 30 min : dix rappels.
    expect(minutesDeRappel({ startMinute: 840, endMinute: 870 })).toHaveLength(10)
  })
})

describe('Les reports', () => {
  it('« Later » : une fois par séance, jamais pour une ancre ni pour une séance déjà reportée', () => {
    expect(plusTardPermis(vide, bloc)).toBe(true)
    const apres = noterReport(vide, { date: '2026-10-15', kind: 'later', blockId: bloc.id, refId: 't1' })
    expect(plusTardPermis(apres, bloc)).toBe(false)
    expect(plusTardPermis(vide, { id: 'ancre-a-2026-10-15', kind: 'ancre' })).toBe(false)
    expect(plusTardPermis(vide, { id: 'promesse-report-x', kind: 'task' })).toBe(false)
  })

  it('« Tomorrow » : deux fois par semaine, une fois par jour', () => {
    let l = vide
    expect(reportJourneePermis(l, '2026-10-13')).toBe(true) // mardi
    l = noterReport(l, { date: '2026-10-13', kind: 'day' })
    expect(reportJourneePermis(l, '2026-10-13')).toBe(false) // déjà fait aujourd'hui
    expect(reportJourneePermis(l, '2026-10-14')).toBe(true)
    l = noterReport(l, { date: '2026-10-14', kind: 'day' })
    expect(reportsJourneeCetteSemaine(l, '2026-10-15')).toBe(2)
    expect(reportJourneePermis(l, '2026-10-15')).toBe(false)
    // Lundi suivant : la semaine repart.
    expect(reportJourneePermis(l, '2026-10-19')).toBe(true)
  })

  it('ce que les reports retirent d’aujourd’hui', () => {
    const later = noterReport(vide, { date: '2026-10-15', kind: 'later', blockId: bloc.id, refId: 't1' })
    expect(pliesParReport(later, '2026-10-15', ['t1', 't2', 'o1'])).toEqual(['t1'])
    expect(pliesParReport(later, '2026-10-16', ['t1', 't2', 'o1'])).toEqual([])
    const journee = noterReport(vide, { date: '2026-10-15', kind: 'day' })
    expect(pliesParReport(journee, '2026-10-15', ['t1', 't2', 'o1'])).toEqual(['t1', 't2', 'o1'])
  })
})

import { computePlan } from './engine'
import { sleepScheduleEntries } from '@shared/sleep'
import type { PlanningInput, TaskItem } from './types'
import { journeeReportable, optionsPlusTard, travailDuJour } from './report'

const tache = (over: Partial<TaskItem> = {}): TaskItem => ({
  id: 'tache-1', title: 'Portfolio site', plan: 'Finir la page', deadline: '2026-08-20', importance: 5,
  category: 'général', workKind: 'routine', estimatedMinutes: 180, remainingMinutes: 180, correctionFactor: 1,
  parentTaskId: null, partOrder: null, extraMinutes: 0, status: 'active', appsToBlock: [], createdAt: '2026-08-01T10:00:00.000Z',
  ...over,
})
const entree = (over: Partial<PlanningInput> = {}): PlanningInput => ({
  today: '2026-08-11', rangeEnd: '2026-08-17', tasks: [], objectives: [], ancres: [],
  schedule: sleepScheduleEntries('23:00', '07:00'), observations: [], anchorMissCounts: {}, dailyUtilization: {},
  weeklyObjectiveServed: {}, objectiveLastServed: {}, lastSignalAt: {}, tasksCreatedPerWeek: {}, consecutiveDelays: {},
  ...over,
})

describe('« Later » et « Tomorrow » sur un vrai plan', () => {
  it('propose des heures aujourd’hui, espacées d’une heure, puis demain', () => {
    const plan = computePlan(entree({ tasks: [tache()] }), new Date(2026, 7, 11, 9, 0))
    const o = optionsPlusTard({ plan, today: '2026-08-11', nowMinute: 540, bloc: { kind: 'task', refId: 'tache-1', workMinutes: 90 }, deadline: '2026-08-20' })
    expect(o.length).toBeGreaterThan(1)
    const aujourdhui = o.filter((x) => x.date === '2026-08-11')
    expect(aujourdhui.every((x) => x.startMinute >= 555)).toBe(true)
    for (let i = 1; i < aujourdhui.length; i++) expect(aujourdhui[i]!.startMinute - aujourdhui[i - 1]!.startMinute).toBeGreaterThanOrEqual(60)
    expect(o.at(-1)!.date).toBe('2026-08-12')
  })

  it('pas de « demain » après l’échéance', () => {
    const plan = computePlan(entree({ tasks: [tache({ deadline: '2026-08-11' })] }), new Date(2026, 7, 11, 9, 0))
    const o = optionsPlusTard({ plan, today: '2026-08-11', nowMinute: 540, bloc: { kind: 'task', refId: 'tache-1', workMinutes: 90 }, deadline: '2026-08-11' })
    expect(o.every((x) => x.date === '2026-08-11')).toBe(true)
  })

  it('« Tomorrow » tient quand l’échéance est loin, pas quand elle est aujourd’hui', () => {
    // Aujourd'hui retiré : c'est ce que « Tomorrow » ferait.
    const loin = entree({ tasks: [tache()], folded: ['tache-1'] })
    const sans = computePlan(loin, new Date(2026, 7, 11, 9, 0))
    expect(travailDuJour(sans, '2026-08-11')).toBe(0)
    expect(journeeReportable({ planApres: sans, inputApres: loin, refs: [{ kind: 'task', refId: 'tache-1' }] })).toBe(true)
    // 15 h dues demain : sans aujourd'hui, demain seul ne suffit pas.
    const serre = entree({ tasks: [tache({ remainingMinutes: 900, estimatedMinutes: 900, deadline: '2026-08-12' })], folded: ['tache-1'] })
    const planSerre = computePlan(serre, new Date(2026, 7, 11, 9, 0))
    expect(journeeReportable({ planApres: planSerre, inputApres: serre, refs: [{ kind: 'task', refId: 'tache-1' }] })).toBe(false)
    expect(travailDuJour(planSerre, '2026-08-12')).toBeGreaterThan(0)
  })
})
