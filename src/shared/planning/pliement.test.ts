import { describe, expect, it } from 'vitest'
import { LearningStateSchema, SessionConfirmationsStateSchema, type SessionEvent } from '@shared/schemas'
import { sleepScheduleEntries } from '@shared/sleep'
import { computePlan } from './engine'
import { applyConfirmation, decalagePossible, decalerAncre, overlayDueFor } from './clock'
import { minutesPliees, pliageEnPause, probabiliteCreation, type Creation } from './pliement'
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
    expect(minutesPliees(l([true, true]), { kind: 'task', refId: 't' }, TODAY)).toBe(60)
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
