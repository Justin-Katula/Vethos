import { describe, it, expect } from 'vitest'
import { LearningStateSchema, SessionConfirmationsStateSchema, type SessionEvent } from '@shared/schemas'
import {
  ajusterConfiance,
  confiance,
  contreOffre,
  creerPromesse,
  deciderStop,
  finUrgence,
  idBlocPromesse,
  niveauConfiance,
  optionsRattrapage,
  ouvrirPause,
  ouvrirUrgence,
  prendreSouffle,
  promessesAPoser,
  retourDuSouffle,
  souffleAvant,
  stopPermis,
  suivrePromesses,
  ticPauses,
  urgenceCommeAbandon,
  verdictStop,
  type FaitsDuStop,
} from './trust'
import { applyStop, applyWorkCredit } from './clock'
import { computePlan } from './engine'
import { sleepScheduleEntries } from '@shared/sleep'
import type { PlanningInput, TaskItem } from './types'

const TODAY = '2026-09-21'
const vide = () => LearningStateSchema.parse({})

const faits = (over: Partial<FaitsDuStop> = {}): FaitsDuStop => ({
  heldMinutes: 30,
  plannedMinutes: 50,
  attemptsBefore: 0,
  kind: 'task',
  nowMinute: 16 * 60 + 50,
  ...over,
})

describe('Confiance et niveaux', () => {
  it('départ au niveau 2 ; les promesses tenues font monter, les rompues descendre', () => {
    expect(confiance(undefined)).toBeCloseTo(2 / 3)
    expect(niveauConfiance(undefined)).toBe(2)
    let l = vide()
    for (let i = 0; i < 12; i++) l = ajusterConfiance(l, 'succes')
    expect(niveauConfiance(l.trust)).toBe(1)
    let m = vide()
    m = ajusterConfiance(m, 'echecGrave')
    expect(niveauConfiance(m.trust)).toBe(3)
    m = ajusterConfiance(m, 'echecGrave')
    expect(niveauConfiance(m.trust)).toBe(4)
  })
})

describe('Le Stop : contre-offre et verdict', () => {
  it('la contre-offre compare la raison aux faits, seulement quand elle ne colle pas', () => {
    const msg = contreOffre('tired', faits({ attemptsBefore: 3, sleptHours: 8 }))
    expect(msg).toBe(
      'You say tired. It’s 16:50, you slept 8 h, and you tried to open a blocked app 3 times in 10 min. That looks more like distraction. 10 more minutes.',
    )
    expect(contreOffre('distracted', faits({ attemptsBefore: 2 }))).toBeNull()
  })

  it('le moteur tranche : pas de place, report, abandon', () => {
    const f = faits()
    expect(verdictStop({ niveau: 2, place: false, raison: 'tired', faits: f })).toBe('no-room')
    expect(verdictStop({ niveau: 1, place: true, raison: null, faits: f })).toBe('postponed')
    expect(verdictStop({ niveau: 2, place: true, raison: 'no-rush', faits: f })).toBe('postponed')
    expect(verdictStop({ niveau: 2, place: true, raison: 'boring', faits: f })).toBe('abandoned')
    expect(verdictStop({ niveau: 3, place: true, raison: 'no-rush', faits: f, contreOffreRefusee: true })).toBe('abandoned')
  })

  it('au-delà d’un arrêt sur trois en urgence, l’urgence compte comme un abandon', () => {
    const stop = { date: TODAY, stop: { reason: 'tired', attemptsBefore: 0 }, stoppedEarly: true } as unknown as SessionEvent
    const urgence = { date: TODAY, blockId: 'b', startMs: 0, apps: [], appCount: 0, attempts: 0 }
    expect(urgenceCommeAbandon({ sessionEvents: [stop, stop], emergencyPauses: [urgence] }, TODAY)).toBe(false)
    expect(urgenceCommeAbandon({ sessionEvents: [stop, stop], emergencyPauses: [urgence, urgence] }, TODAY)).toBe(true)
  })
})

const conf = () =>
  SessionConfirmationsStateSchema.parse({
    date: TODAY,
    confirmedAt: { b: 1 },
    observedPending: { blockId: 'b', kind: 'task', refId: 't', startMinute: 540, endMinute: 600, workMinutes: 60 },
  })

describe('Pauses', () => {
  it('une pause allonge la fenêtre, et ses minutes ne comptent jamais comme du travail', () => {
    const c = ouvrirPause(conf(), { kind: 'no-room', nowMinute: 560, nowMs: 0 })!
    expect(c.observedPending).toMatchObject({ endMinute: 615, workMinutes: 75, pausedMinutes: 15 })
    const r = applyWorkCredit(vide(), c, c.observedPending!, 540)
    expect(r.creditedMinutes).toBe(60)
    const fin = ticPauses(vide(), c, 575, 0)
    expect(fin.confirmations.pause).toBeNull()
  })

  it('un Stop après une pause ne compte pas la pause comme tenue', () => {
    const c = ouvrirPause(conf(), { kind: 'no-room', nowMinute: 560, nowMs: 0 })!
    const apres = ticPauses(vide(), c, 575, 0).confirmations
    const learning = LearningStateSchema.parse({
      sessionEvents: [{ blockId: 'b', date: TODAY, kind: 'task', refId: 't', plannedStartMinute: 540, plannedMinutes: 60, started: true, createdAt: '2026-09-21T09:00:00.000Z' }],
    })
    const r = applyStop({ learning, confirmations: apres, nowMs: 0, minute: 585, reason: 'tired' })!
    expect(r.heldMinutes).toBe(30)
  })

  it('urgence : retour avant 15 min sans tentative = +1 succès ; tentative = échec grave', () => {
    const u = ouvrirUrgence(vide(), conf(), { nowMinute: 560, nowMs: 1000, apps: ['a', 'b', 'c'] })!
    expect(ouvrirUrgence(vide(), conf(), { nowMinute: 560, nowMs: 1000, apps: ['a', 'b', 'c', 'd'] })).toBeNull()
    const tot = finUrgence(u.learning, u.confirmations, { nowMinute: 565, nowMs: 2000, end: 'voluntary' })
    expect(tot.learning.trust!.successes).toBe(1)
    expect(tot.confirmations.observedPending!.endMinute).toBe(605)
    expect(tot.learning.emergencyPauses![0]).toMatchObject({ end: 'voluntary', endMs: 2000 })
    const coupe = finUrgence(u.learning, u.confirmations, { nowMinute: 565, nowMs: 2000, end: 'attempt' })
    expect(coupe.learning.trust!.failures).toBe(2)
    const auto = ticPauses(u.learning, u.confirmations, 575, 3000)
    expect(auto.learning.emergencyPauses![0]!.end).toBe('auto')
    expect(auto.learning.trust).toBeUndefined()
  })
})

describe('Promesses', () => {
  const avecPromesse = () =>
    creerPromesse(vide(), {
      id: 'p1',
      kind: 'task',
      refId: 't',
      fromBlockId: 'x',
      date: TODAY,
      startMinute: 600,
      minutes: 30,
      createdAt: '2026-09-21T09:00:00.000Z',
    })

  it('rompue si jamais démarrée ; tenue si la séance se referme', () => {
    const l = avecPromesse()
    const vide_ = SessionConfirmationsStateSchema.parse({ date: TODAY })
    expect(suivrePromesses(l, vide_, TODAY, 620).promises![0]!.status).toBe('pending')
    const rompue = suivrePromesses(l, vide_, TODAY, 631)
    expect(rompue.promises![0]!.status).toBe('broken')
    expect(rompue.trust!.failures).toBe(2)

    const id = idBlocPromesse('p1')
    const c = SessionConfirmationsStateSchema.parse({ date: TODAY, confirmedAt: { [id]: 1 } })
    const tenue = suivrePromesses(
      {
        ...l,
        sessionEvents: [{ blockId: id, date: TODAY, kind: 'task', refId: 't', category: 'général', plannedStartMinute: 600, plannedMinutes: 30, started: true, delayMinutes: 2, spontaneous: false, heldMinutes: 30, stoppedEarly: false, blockedAttempts: 0, load48hMinutes: 0, promiseId: 'p1', createdAt: '2026-09-21T10:00:00.000Z' }],
      },
      c,
      TODAY,
      640,
    )
    expect(tenue.promises![0]).toMatchObject({ status: 'kept', startedMinute: 602 })
    expect(tenue.trust!.successes).toBe(1)
  })

  it('pas de Stop dans un rattrapage ; un seul souffle, avant ou pendant', () => {
    const l = avecPromesse()
    const id = idBlocPromesse('p1')
    const c = SessionConfirmationsStateSchema.parse({
      date: TODAY,
      confirmedAt: { [id]: 1 },
      observedPending: { blockId: id, kind: 'task', refId: 't', startMinute: 600, endMinute: 630, workMinutes: 30 },
    })
    expect(stopPermis(l, c)).toBe(false)
    const s = prendreSouffle(l, c, 610, 0)!
    expect(s.confirmations.pause!.kind).toBe('breather')
    expect(prendreSouffle(s.learning, c, 610, 0)).toBeNull()
    // Le souffle fini, la reprise attend : 8 min de retard = +1 échec.
    const t = ticPauses(s.learning, s.confirmations, 625, 0)
    expect(t.confirmations.awaitingReturn).toEqual({ blockId: id, sinceMinute: 625 })
    const r = retourDuSouffle(t.learning, t.confirmations, 633)
    expect(r.learning.trust!.failures).toBe(1)
    expect(r.confirmations.observedPending!.endMinute).toBe(653)

    const avant = souffleAvant(l, 'p1')!
    expect(avant.promises![0]).toMatchObject({ startMinute: 615, breather: { phase: 'before' } })
    expect(souffleAvant(avant, 'p1')).toBeNull()
  })

  it('le moteur pose la promesse à l’heure choisie et ne place pas le travail deux fois', () => {
    const tache: TaskItem = {
      id: 'bbbbbbbb-1111-4111-8111-111111111111',
      title: 'Rapport',
      plan: 'Plan de test pour tâche',
      deadline: '2026-09-25',
      importance: 5,
      category: 'général',
      workKind: 'routine',
      estimatedMinutes: 120,
      remainingMinutes: 120,
      correctionFactor: 1,
      parentTaskId: null,
      partOrder: null,
      extraMinutes: 0,
      status: 'active',
      appsToBlock: [],
      createdAt: '2026-09-01T10:00:00.000Z',
    }
    const input: PlanningInput = {
      today: TODAY,
      rangeEnd: '2026-09-27',
      tasks: [tache],
      objectives: [],
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
      promises: promessesAPoser(
        creerPromesse(vide(), { id: 'p1', kind: 'task', refId: tache.id, fromBlockId: 'x', date: '2026-09-22', startMinute: 14 * 60, minutes: 45, createdAt: '2026-09-21T09:00:00.000Z' }),
      ),
    }
    const plan = computePlan(input, new Date(2026, 8, 21, 8, 0))
    const p = plan.blocks.find((b) => b.promiseId === 'p1')!
    expect(p).toMatchObject({ date: '2026-09-22', startMinute: 840, workMinutes: 45 })
    const total = plan.blocks.filter((b) => b.refId === tache.id).reduce((t, b) => t + b.workMinutes, 0)
    expect(total).toBe(120)
    expect(plan.internalError).toBeUndefined()

    const options = optionsRattrapage({ plan, today: TODAY, nowMinute: 8 * 60, minutes: 30, kind: 'task', refId: tache.id, niveau: 2, deadline: tache.deadline })
    expect(options.length).toBe(3)
    expect(options[0]!.date).toBe(TODAY)
    expect(options[0]!.startMinute).toBeGreaterThanOrEqual(8 * 60 + 15)
    const n4 = optionsRattrapage({ plan, today: TODAY, nowMinute: 20 * 60, minutes: 30, kind: 'task', refId: tache.id, niveau: 4, deadline: tache.deadline })
    expect(n4.every((o) => o.date === TODAY || (o.date === '2026-09-22' && o.startMinute <= 20 * 60))).toBe(true)
  })
})

describe('deciderStop', () => {
  const learning = () =>
    LearningStateSchema.parse({
      sessionEvents: [{ blockId: 'b', date: TODAY, kind: 'task', refId: 't', plannedStartMinute: 540, plannedMinutes: 60, started: true, createdAt: '2026-09-21T09:00:00.000Z' }],
    })
  const plan = (faisable: boolean) =>
    ({
      blocks: [],
      capacities: [{ date: TODAY, slots: [{ startMinute: 600, endMinute: 900, durationMinutes: 300, cognitiveWindow: 'NORMALE' }] }],
      feasibility: { densities: [{ feasible: faisable }] },
      verdicts: [],
      objectiveDoses: {},
    }) as unknown as import('./types').PlanningResult
  const base = (over: Partial<Parameters<typeof deciderStop>[0]> = {}) => ({
    learning: learning(),
    confirmations: conf(),
    nowMs: 0,
    minute: 560,
    reason: 'no-rush' as const,
    planApres: () => ({ plan: plan(true), input: { today: TODAY, weeklyObjectiveServed: {} } }),
    ...over,
  })

  it('il y a la place : arrêté, verdict, et des créneaux pour la promesse', () => {
    const r = deciderStop(base())!
    expect(r.etape).toBe('arrete')
    if (r.etape !== 'arrete') return
    expect(r.verdict).toBe('postponed')
    expect(r.minutes).toBe(40)
    expect(r.options[0]).toEqual({ date: TODAY, startMinute: 600 })
    expect(r.learning.sessionEvents[0]!.stop).toMatchObject({ level: 2, verdict: 'postponed' })
  })

  it('pas de place : rien ne s’arrête, pause de 15 min, puis on finit', () => {
    const r = deciderStop(base({ planApres: () => ({ plan: plan(false), input: { today: TODAY, weeklyObjectiveServed: {} } }) }))!
    expect(r.etape).toBe('pas-de-place')
    if (r.etape !== 'pas-de-place') return
    expect(r.confirmations.pause!.kind).toBe('no-room')
    expect(r.confirmations.stoppedBlockIds).toEqual([])
    expect(r.learning.sessionEvents[0]).toMatchObject({ forced: true, heldMinutes: null })
  })

  it('niveau 3 : une raison qui ne colle pas amène la contre-offre ; refusée, c’est un abandon', () => {
    let l = learning()
    l = ajusterConfiance(l, 'echecGrave')
    const r = deciderStop(base({ learning: l, reason: 'boring' }))!
    expect(r.etape).toBe('contre-offre')
    const refus = deciderStop(base({ learning: l, reason: 'boring', contreOffreRefusee: true }))!
    expect(refus.etape === 'arrete' && refus.verdict).toBe('abandoned')
  })
})
