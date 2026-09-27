import { describe, it, expect } from 'vitest'
import { LearningStateSchema, SessionConfirmationsStateSchema, type SessionEvent } from '@shared/schemas'
import {
  ajusterConfiance,
  confiance,
  ATTENTE_STOP_MINUTES,
  comparaison,
  accorderDixMinutes,
  continuer,
  demanderStop,
  dixMinutesEchues,
  executerStop,
  optionsUrgence,
  preparerStop,
  reactionRaison,
  reporterEnUrgence,
  stopEchu,
  tentativePendantUrgence,
  ticConfiance,
  creerPromesse,
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
  urgenceTropFrequente,
  type FaitsDuStop,
} from './trust'
import { pliesDuJour } from './pliement'
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

describe('Le Stop : chaque raison a sa réaction', () => {
  it('la comparaison aux faits, seulement quand la raison ne colle pas', () => {
    expect(comparaison('tired', faits({ attemptsBefore: 3, sleptHours: 8 }))).toBe(
      'You say tired. It’s 16:50, you slept 8 h, and you tried to open a blocked app 3 times in 10 min. That looks more like distraction.',
    )
    expect(comparaison('distracted', faits({ attemptsBefore: 2 }))).toBeNull()
  })

  it('too hard → blocs de 25 min en fenêtre profonde ; boring → 10 min d’abord', () => {
    expect(reactionRaison('too-hard', faits(), { niveau: 2 }).placement).toEqual({ morceau: 25, preference: 'profonde' })
    const b = reactionRaison('boring', faits({ heldMinutes: 5 }), { niveau: 2 })
    expect(b.dixMinutes).toBe(true)
    expect(b.placement).toEqual({ morceau: 25, preference: 'tot' })
  })

  it('no rush → les vrais chiffres ; distracted → les tentatives, et le mode profond', () => {
    const n = reactionRaison('no-rush', faits(), { niveau: 2, echeance: { jours: 4, resteMinutes: 600, libreMinutes: 1200 } })
    expect(n.lignes).toEqual(['Due in 4 days. 10 h left, 20 h free until then.'])
    const d = reactionRaison('distracted', faits({ attemptsBefore: 2 }), { niveau: 2 })
    expect(d.lignes).toEqual(['2 blocked-app attempts in the last 10 min.'])
    expect(d.placement.deep).toBe(true)
  })

  it('tired → un matin reposé si les faits collent ; sinon la comparaison, traité comme une distraction', () => {
    expect(reactionRaison('tired', faits({ heldMinutes: 40 }), { niveau: 2 })).toEqual({ lignes: [], dixMinutes: false, placement: { preference: 'repose' } })
    const faux = reactionRaison('tired', faits({ attemptsBefore: 1 }), { niveau: 2 })
    expect(faux.lignes[0]).toMatch(/looks more like distraction/)
    expect(faux.placement).toEqual({ preference: 'tot', deep: true })
  })

  it('aux niveaux 3-4, une raison qui ne colle pas montre aussi la comparaison', () => {
    expect(reactionRaison('boring', faits(), { niveau: 2 }).lignes).toEqual([])
    expect(reactionRaison('boring', faits(), { niveau: 3 }).lignes[0]).toMatch(/You say boring/)
  })

  it('au-delà d’un arrêt sur trois en urgence, l’urgence n’en est plus une', () => {
    const stop = { date: TODAY, stop: { reason: 'tired', attemptsBefore: 0 }, stoppedEarly: true } as unknown as SessionEvent
    const urgence = { date: TODAY, blockId: 'b', startMs: 0, apps: [], appCount: 0, attempts: 0 }
    expect(urgenceTropFrequente({ sessionEvents: [stop, stop], emergencyPauses: [urgence] }, TODAY)).toBe(false)
    expect(urgenceTropFrequente({ sessionEvents: [stop, stop], emergencyPauses: [urgence, urgence] }, TODAY)).toBe(true)
  })

  it('l’attente : 5 min, plus quand la confiance baisse', () => {
    expect(ATTENTE_STOP_MINUTES).toEqual({ 1: 5, 2: 5, 3: 10, 4: 15 })
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

describe('Le Stop, de bout en bout', () => {
  const learning = () =>
    LearningStateSchema.parse({
      sessionEvents: [{ blockId: 'b', date: TODAY, kind: 'task', refId: 't', plannedStartMinute: 540, plannedMinutes: 60, started: true, createdAt: '2026-09-21T09:00:00.000Z' }],
    })
  const plan = (faisable: boolean) =>
    ({
      blocks: [],
      capacities: [
        { date: TODAY, effectiveCapacityMinutes: 300, slots: [{ startMinute: 600, endMinute: 900, durationMinutes: 300, cognitiveWindow: 'NORMALE' }] },
        { date: '2026-09-22', effectiveCapacityMinutes: 720, slots: [{ startMinute: 480, endMinute: 1200, durationMinutes: 720, cognitiveWindow: 'PROFONDE' }] },
      ],
      feasibility: { densities: [{ feasible: faisable }] },
      verdicts: [{ taskId: 't', neededMinutes: 100, placedMinutes: 100, status: 'placed' }],
      objectiveDoses: {},
    }) as unknown as import('./types').PlanningResult
  const apres = (f = true) => () => ({ plan: plan(f), input: { today: TODAY, weeklyObjectiveServed: {} } })
  // « t » : 10 h de travail, créée le 14, due le 27 — 90 min pliables en tout ;
  // le 21, 45 min de droit (gagné 51, fondu 45).
  const pliage = { element: { kind: 'task' as const, refId: 't', total: 600, debut: '2026-09-14', fin: '2026-09-27' }, creations: [] }

  it('pas de place : rien ne s’arrête, pause de 15 min, puis on finit', () => {
    const r = preparerStop({ learning: learning(), confirmations: conf(), nowMs: 0, minute: 560, reason: 'boring', planApres: apres(false), pliage })!
    expect(r.etape).toBe('pas-de-place')
    if (r.etape !== 'pas-de-place') return
    expect(r.confirmations.pause!.kind).toBe('no-room')
    expect(r.learning.sessionEvents[0]).toMatchObject({ forced: true, heldMinutes: null })
  })

  // La version idéale de « t » : 50 min aujourd'hui, le reste demain (240 en tout).
  const avecIdeal = (aujourdhui: number) => ({ ...learning(), ideals: { 'task:t': { since: TODAY, base: 0, points: [[TODAY, aujourdhui], ['2026-09-22', 240]] as Array<[string, number]> } } })

  it('la place : la réaction, puis l’attente bloquée, puis l’arrêt — le reste se plie, sans heure à choisir', () => {
    const prep = preparerStop({ learning: avecIdeal(50), confirmations: conf(), nowMs: 0, minute: 560, reason: 'too-hard', planApres: apres(), pliage })!
    expect(prep.etape).toBe('reaction')
    if (prep.etape !== 'reaction') return
    expect(prep.attenteMinutes).toBe(5)
    // 20 min tenues sur 50 prévues : 30 min derrière l'idéal (90 permises) ; droit 45, pli 40.
    expect(prep.reaction.lignes[0]).toBe('40 min folds into the next days. 5 min left to fold.')
    const c = demanderStop(conf(), { nowMs: 0, minute: 560, reason: 'too-hard', attenteMinutes: prep.attenteMinutes, placement: prep.reaction.placement })!
    expect(c.stopPending).toMatchObject({ untilMinute: 565, untilMs: 300_000 })
    // Rien n'est arrêté pendant l'attente.
    expect(c.stoppedBlockIds).toEqual([])
    expect(stopEchu(c, 299_999)).toBeNull()
    expect(stopEchu(c, 300_000)).not.toBeNull()
    const fin = executerStop({ learning: learning(), confirmations: c, nowMs: 300_000 })
    const e = fin.learning.sessionEvents[0]!
    expect(e).toMatchObject({ heldMinutes: 25, stoppedEarly: true, stop: { reason: 'too-hard', verdict: 'folded', foldedMinutes: 35 } })
    // Plié : aucune heure à choisir, le moteur le répartit dès demain.
    expect(fin.confirmations.promiseChoice ?? null).toBeNull()
    expect(pliesDuJour(fin.learning, fin.confirmations)).toEqual(['t'])
  })

  it('le pli refusé : 15 % derrière la version idéale, droit pas encore gagné, ou pas la place', () => {
    // 20 min tenues sur 130 prévues : 110 min derrière l'idéal, plus que les 15 % (90 min).
    const r = preparerStop({ learning: avecIdeal(130), confirmations: conf(), nowMs: 0, minute: 560, reason: 'boring', planApres: apres(), pliage })!
    expect(r.etape === 'pas-de-place' && r.message).toBe('Already 15% behind. 15-minute break, then you finish.')
    // Tôt dans la vie de la tâche : le droit n'est pas encore gagné.
    const tot = { ...pliage, element: { ...pliage.element, debut: '2026-09-21', fin: '2026-10-11' } }
    const r2 = preparerStop({ learning: learning(), confirmations: conf(), nowMs: 0, minute: 560, reason: 'boring', planApres: apres(), pliage: tot })!
    expect(r2.etape === 'pas-de-place' && r2.message).toBe('No fold earned yet. 15-minute break, then you finish.')
    // Une semaine chargée de créations : le libre ne couvre plus ce qui viendra.
    const creations = Array.from({ length: 30 }, (_, i) => ({ kind: 'task' as const, date: `2026-09-${String(i % 20 + 1).padStart(2, '0')}`, minutes: 3000 }))
    const plein = preparerStop({ learning: learning(), confirmations: conf(), nowMs: 0, minute: 560, reason: 'boring', planApres: apres(), pliage: { ...pliage, creations } })!
    expect(plein.etape === 'pas-de-place' && plein.message).toBe('No room to fold. 15-minute break, then you finish.')
  })

  it('une ancre ne s’arrête pas', () => {
    const a = LearningStateSchema.parse({
      sessionEvents: [{ blockId: 'b', date: TODAY, kind: 'ancre', refId: 'x', plannedStartMinute: 540, plannedMinutes: 60, started: true, createdAt: '2026-09-21T09:00:00.000Z' }],
    })
    const c = conf()
    const ca = { ...c, observedPending: { ...c.observedPending!, kind: 'ancre' as const } }
    expect(stopPermis(a, ca)).toBe(false)
    expect(preparerStop({ learning: a, confirmations: ca, nowMs: 0, minute: 560, reason: 'boring', planApres: apres(), pliage })).toBeNull()
  })

  it('« Je continue » annule l’attente, et le garde au journal', () => {
    const c = demanderStop(conf(), { nowMs: 0, minute: 560, reason: 'boring', attenteMinutes: 5, placement: { preference: 'tot' } })!
    const r = continuer(learning(), c)
    expect(r.confirmations.stopPending).toBeNull()
    expect(r.learning.sessionEvents[0]!.stopsWaived).toBe(1)
  })

  it('« 10 more minutes » : « Stop ? » revient 10 min plus tard, sans reproposer les 10 min', () => {
    const prep = preparerStop({ learning: learning(), confirmations: conf(), nowMs: 0, minute: 560, reason: 'boring', planApres: apres(), pliage })!
    expect(prep.etape === 'reaction' && prep.reaction.dixMinutes).toBe(true)
    const d = accorderDixMinutes(learning(), conf(), { nowMs: 0, reason: 'boring', text: 'meh' })!
    expect(d.learning.sessionEvents[0]!.stopsWaived).toBe(1)
    expect(dixMinutesEchues(d.confirmations, 599_999)).toBeNull()
    expect(dixMinutesEchues(d.confirmations, 600_000)).toEqual({ reason: 'boring', text: 'meh' })
    // Une seule fois par bloc.
    expect(accorderDixMinutes(d.learning, d.confirmations, { nowMs: 600_000, reason: 'boring' })).toBeNull()
    const encore = preparerStop({ learning: d.learning, confirmations: d.confirmations, nowMs: 600_000, minute: 570, reason: 'boring', planApres: apres(), pliage })!
    expect(encore.etape === 'reaction' && encore.reaction.dixMinutes).toBe(false)
    // Continuer, ou dire oui : la question a sa réponse et ne revient plus.
    expect(dixMinutesEchues(continuer(d.learning, d.confirmations).confirmations, 700_000)).toBeNull()
    const oui = demanderStop(d.confirmations, { nowMs: 600_000, minute: 570, reason: 'boring', attenteMinutes: 5, placement: { preference: 'tot' } })!
    expect(oui.dixMinutes!.repondu).toBe(true)
    // Plus de place au bout des 10 min : pause de 15 min, et plus de relance.
    const plein = preparerStop({ learning: d.learning, confirmations: d.confirmations, nowMs: 600_000, minute: 570, reason: 'boring', planApres: apres(false), pliage })!
    expect(plein.etape).toBe('pas-de-place')
    if (plein.etape === 'pas-de-place') expect(dixMinutesEchues({ ...plein.confirmations, pause: null }, 2_000_000)).toBeNull()
  })

  it('urgence : jusqu’à quand repousser, puis tout bloqué sauf 3 apps, et l’app regarde', () => {
    const u = optionsUrgence({ learning: learning(), confirmations: conf(), nowMs: 0, minute: 560, planApres: apres() })!
    expect(u.minutes).toBe(40)
    expect(u.options.length).toBeGreaterThan(0)
    expect(optionsUrgence({ learning: learning(), confirmations: conf(), nowMs: 0, minute: 560, planApres: apres(false) })!.options).toEqual([])
    const r = reporterEnUrgence({ learning: learning(), confirmations: conf(), nowMs: 0, minute: 560, option: { date: TODAY, startMinute: 660 }, minutes: 40, apps: ['a'], label: 'Rapport' })!
    expect(r.learning.sessionEvents[0]!.stop).toMatchObject({ reason: 'real-event', verdict: 'urgent' })
    expect(r.learning.promises![0]).toMatchObject({ startMinute: 660, minutes: 40 })
    expect(r.confirmations.urgence).toMatchObject({ untilMinute: 660, apps: ['a'] })
    const vu = tentativePendantUrgence(r.learning, r.confirmations, 60_000)
    expect(vu.trust!.failures).toBe(2)
    expect(tentativePendantUrgence(vu, r.confirmations, 70_000).trust!.failures).toBe(2)
    const fin = ticConfiance(vu, r.confirmations, TODAY, 660, 100 * 60_000)
    expect(fin.confirmations.urgence).toBeNull()
    expect(fin.learning.emergencyPauses![0]).toMatchObject({ end: 'auto', attempts: 1 })
  })
})
