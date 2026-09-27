import { describe, expect, it } from 'vitest'
import { LearningStateSchema, SessionConfirmationsStateSchema, type SessionEvent } from '@shared/schemas'
import { sleepScheduleEntries } from '@shared/sleep'
import { computePlan } from './engine'
import { applyConfirmation, decalagePossible, decalerAncre, overlayDueFor } from './clock'
import { droitDePlier, faitDe, figerIdeaux, idealA, jugerPliage, pliageEnPause, probabiliteCreation, type Creation } from './pliement'
import type { PlacedBlock, PlanningInput } from './types'

const TODAY = '2026-09-21'

const ev = (i: number, plie: boolean): SessionEvent =>
  ({
    blockId: `b${i}`,
    date: `2026-09-${String(10 + i).padStart(2, '0')}`,
    kind: 'task',
    refId: 't',
    plannedStartMinute: 540,
    plannedMinutes: 60,
    started: true,
    stoppedEarly: plie,
    ...(plie ? { stop: { reason: 'boring', attemptsBefore: 0, verdict: 'folded', foldedMinutes: 30 } } : {}),
    createdAt: '2026-09-10T09:00:00.000Z',
  }) as SessionEvent

describe('La probabilité de nouvelles créations', () => {
  it('sans historique : un a priori prudent ; avec : le vrai rythme', () => {
    const vide = probabiliteCreation([], TODAY, 7)
    expect(vide.task.parJour).toBeCloseTo(1 / 7)
    expect(vide.task.auMoinsUne).toBeCloseTo(1 - Math.exp(-1))
    // 8 tâches en 4 semaines : ~2 par semaine.
    const creations: Creation[] = Array.from({ length: 8 }, (_, i) => ({ kind: 'task', date: `2026-08-${String(25 + i).padStart(2, '0')}`, minutes: 100 }))
    creations.push({ kind: 'task', date: '2026-08-24', minutes: 100 })
    const p = probabiliteCreation(creations, TODAY, 7)
    expect(p.task.parJour).toBeGreaterThan(vide.task.parJour)
    expect(p.task.minutesAttendues).toBeGreaterThan(0)
    // Plus l'échéance est loin, plus il viendra de travail d'ici là.
    expect(probabiliteCreation(creations, TODAY, 14).minutesAttendues).toBeGreaterThan(p.minutesAttendues)
  })
})

describe('La pause de pliement', () => {
  it('2 plis sur les 3 dernières séances : suspendu ; deux séances tenues le lèvent', () => {
    const l = (plis: boolean[]) => LearningStateSchema.parse({ sessionEvents: plis.map((p, i) => ev(i, p)) })
    expect(pliageEnPause(l([true, false]), 't')).toBe(false)
    expect(pliageEnPause(l([true, true]), 't')).toBe(true)
    expect(pliageEnPause(l([true, false, true]), 't')).toBe(true)
    expect(pliageEnPause(l([true, true, false, false]), 't')).toBe(false)
  })
})

describe('La version idéale', () => {
  it('figée la première fois que le plan pose la tâche, jamais refigée ; le fait se lit dans les séances', () => {
    const tache = { id: 't', status: 'active', estimatedMinutes: 200, correctionFactor: 1, extraMinutes: 0, deadline: '2026-09-27', createdAt: '2026-09-01T10:00:00.000Z' } as unknown as import('@shared/schemas').Task
    const bloc = (date: string, workMinutes: number) => ({ kind: 'task', refId: 't', date, workMinutes }) as PlacedBlock
    const l0 = LearningStateSchema.parse({ sessionEvents: [{ ...ev(1, false), heldMinutes: 40 }] })
    const l1 = figerIdeaux(l0, { blocks: [bloc(TODAY, 60), bloc('2026-09-22', 60), bloc('2026-09-22', 40)] }, { tasks: [tache], objectives: [], today: TODAY })
    expect(l1.ideals!['task:t']).toEqual({ since: TODAY, base: 40, points: [[TODAY, 100], ['2026-09-22', 200]] })
    // Un autre plan le lendemain (après un pli) ne la change pas.
    expect(figerIdeaux(l1, { blocks: [bloc('2026-09-22', 160)] }, { tasks: [tache], objectives: [], today: '2026-09-22' })).toBe(l1)
    expect(idealA(l1.ideals!['task:t']!, TODAY)).toBe(100)
    expect(idealA(l1.ideals!['task:t']!, '2026-09-20')).toBe(40)
    expect(faitDe(l1, { kind: 'task', refId: 't' }, TODAY)).toBe(40)
    // Plus tard, les jours après son dernier jour s'ajoutent — jamais au-delà du travail entier.
    const l2 = figerIdeaux(l1, { blocks: [bloc('2026-09-22', 999), bloc('2026-09-23', 30)] }, { tasks: [tache], objectives: [], today: '2026-09-22' })
    expect(l2.ideals!['task:t']!.points).toEqual([[TODAY, 100], ['2026-09-22', 200]])
    const long = { ...tache, estimatedMinutes: 400 } as typeof tache
    const l3 = figerIdeaux(l1, { blocks: [bloc('2026-09-23', 90)] }, { tasks: [long], objectives: [], today: '2026-09-22' })
    expect(l3.ideals!['task:t']!.points).toEqual([[TODAY, 100], ['2026-09-22', 200], ['2026-09-23', 290]])
    // La tâche finie ou supprimée : sa version idéale tombe.
    expect(figerIdeaux(l1, { blocks: [] }, { tasks: [], objectives: [], today: TODAY }).ideals).toEqual({})
  })
})

describe('La longueur et le temps', () => {
  it('le droit de plier se gagne jour après jour et fond à l’approche de l’échéance', () => {
    // 20 h, créée le 1er, due le 20 : 3 h pliables en tout.
    const el = { total: 1200, debut: '2026-09-01', fin: '2026-09-20' }
    expect(droitDePlier(el, '2026-09-01').droit).toBe(9)
    expect(droitDePlier(el, '2026-09-10').droit).toBe(90)
    expect(droitDePlier(el, '2026-09-18').droit).toBe(27)
    // Plus long, plus de droit — mais jamais d'un coup.
    expect(droitDePlier({ ...el, total: 2400 }, '2026-09-10').droit).toBe(180)
    expect(droitDePlier({ ...el, total: 2400 }, '2026-09-01').droit).toBe(18)
  })

  it('ce qui est déjà plié se retire du droit', () => {
    const plie = LearningStateSchema.parse({ sessionEvents: [ev(1, true), ev(2, true)] })
    const juger = (learning: typeof plie) =>
      jugerPliage({
        learning,
        element: { kind: 'task', refId: 't', total: 1200, debut: '2026-09-01', fin: '2026-09-20' },
        minutes: 30,
        tenu: 30,
        today: '2026-09-10',
        bloc: { blockId: 'x', date: '2026-09-10' },
        planApres: { blocks: [], capacities: [{ date: '2026-09-10', effectiveCapacityMinutes: 5000 }] } as unknown as import('./types').PlanningResult,
        creations: [],
      })
    // Deux plis de 30 : 60 + 30 ≤ 90 — mais 2 des 3 dernières séances sont pliées.
    expect(juger(plie)).toMatchObject({ ok: false, refus: 'pause' })
    const troisPlis = LearningStateSchema.parse({ sessionEvents: [ev(1, true), ev(2, false), ev(3, false), ev(4, true), ev(5, false), ev(6, false)] })
    expect(juger(troisPlis).ok).toBe(true)
    expect(juger(LearningStateSchema.parse({ sessionEvents: [ev(1, true), ev(2, false), ev(3, false), ev(4, true), ev(5, false), ev(6, false), ev(7, true), ev(8, false), ev(9, false)] }))).toMatchObject({
      ok: false,
      refus: 'droit',
    })
  })
})

describe('L’ancre se décale de 15 min au plus', () => {
  const bloc = { id: 'ancre-a-2026-09-21', kind: 'ancre' as const, startMinute: 18 * 60, refId: 'a' }
  const c0 = SessionConfirmationsStateSchema.parse({ date: TODAY })

  it('« In 5 min » trois fois, puis plus rien ; l’overlay revient à la nouvelle heure', () => {
    let c = decalerAncre(c0, bloc, 1080)!
    expect(c.ancreDecalage).toEqual({ [bloc.id]: 5 })
    const learning = LearningStateSchema.parse({})
    expect(overlayDueFor({ learning, block: bloc, nowMinute: 1084, today: TODAY, decalage: 5 })).toBe(false)
    expect(overlayDueFor({ learning, block: bloc, nowMinute: 1085, today: TODAY, decalage: 5 })).toBe(true)
    c = decalerAncre(c, bloc, 1085)!
    c = decalerAncre(c, bloc, 1090)!
    expect(c.ancreDecalage![bloc.id]).toBe(15)
    expect(decalagePossible(c, bloc, 1095)).toBe(0)
    expect(decalerAncre(c, bloc, 1095)).toBeNull()
    // En retard de 13 min sans décalage : il reste 2 min, pas 5.
    expect(decalagePossible(c0, bloc, 1093)).toBe(2)
  })

  it('le retard se mesure depuis la nouvelle heure ; une tâche ne se décale pas', () => {
    const c = decalerAncre(c0, bloc, 1080)!
    const placed = { ...bloc, date: TODAY, endMinute: 1140, durationMinutes: 60, breakMinutes: 0, workMinutes: 60, label: 'Sport', color: '#fff', cognitiveWindow: 'NORMALE' } as PlacedBlock
    expect(applyConfirmation(LearningStateSchema.parse({}), c, placed, 0, 1087).delayMinutes).toBe(2)
    expect(decalerAncre(c0, { ...bloc, kind: 'task' }, 1080)).toBeNull()
  })
})

describe('Le moteur : un élément plié ne revient pas le jour même', () => {
  it('le reste épaissit les jours suivants', () => {
    const tache = {
      id: '11111111-1111-4111-8111-111111111111', title: 'mm', plan: 'x', deadline: '2026-09-27', importance: 5, category: 'général',
      workKind: 'routine' as const, estimatedMinutes: 280, remainingMinutes: 280, correctionFactor: 1, parentTaskId: null, partOrder: null,
      extraMinutes: 0, status: 'active' as const, appsToBlock: [], createdAt: '2026-09-01T10:00:00.000Z',
    }
    const input: PlanningInput = {
      today: TODAY, rangeEnd: '2026-09-27', tasks: [tache], objectives: [], ancres: [], schedule: sleepScheduleEntries('23:00', '07:00'),
      observations: [], anchorMissCounts: {}, dailyUtilization: {}, weeklyObjectiveServed: {}, objectiveLastServed: {}, lastSignalAt: {},
      tasksCreatedPerWeek: {}, consecutiveDelays: {},
    }
    const maintenant = new Date(2026, 8, 21, 9, 30)
    expect(computePlan(input, maintenant).blocks.some((b) => b.date === TODAY)).toBe(true)
    const plie = computePlan({ ...input, folded: [tache.id] }, maintenant)
    expect(plie.blocks.some((b) => b.date === TODAY)).toBe(false)
    expect(plie.blocks.reduce((t, b) => t + b.workMinutes, 0)).toBe(280)
    expect(plie.internalError).toBeUndefined()
  })
})
