import { describe, it, expect } from 'vitest'
import { evaluateRequest, touchesAbsoluteRule } from './requests'
import type { AncreItem, ScheduleEntry } from './types'

const sleep: ScheduleEntry[] = [
  { dayOfWeek: 1, startMinute: 0, endMinute: 420, categoryType: 'sleep', label: 'Sommeil', color: '#4C566A' },
  { dayOfWeek: 1, startMinute: 1380, endMinute: 1440, categoryType: 'sleep', label: 'Sommeil', color: '#4C566A' },
]

const sport: AncreItem = {
  id: 'a1',
  name: 'Sport',
  color: '#3ECF8E',
  trigger: 'sport',
  anchorMinute: 1080,
  daysOfWeek: [1],
  normalMaxMinutes: 60,
  minimumMinutes: 24,
  createdAt: '2026-08-01T10:00:00.000Z',
}

const capacity = [
  { date: '2026-08-11', capacityMinutes: 300 },
  { date: '2026-08-12', capacityMinutes: 300 },
]

describe('E.5 — règles absolues', () => {
  it('une demande qui mord sur le sommeil n’est jamais accordée telle quelle', () => {
    expect(
      touchesAbsoluteRule({
        request: { type: 'rest', minutes: 60, date: '2026-08-11', startMinute: 1350 },
        daySchedule: sleep,
        dayAncres: [],
      }),
    ).toBe(true)
  })

  it('une demande qui mord sur une ancre non plus', () => {
    expect(
      touchesAbsoluteRule({
        request: { type: 'free_time', minutes: 60, date: '2026-08-11', startMinute: 1100 },
        daySchedule: sleep,
        dayAncres: [sport],
      }),
    ).toBe(true)
  })

  it('elle reçoit l’alternative la plus proche qui respecte la règle', () => {
    const verdict = evaluateRequest({
      request: { type: 'rest', minutes: 60, date: '2026-08-11', startMinute: 1350 },
      tasks: [],
      dailyCapacity: capacity,
      today: '2026-08-11',
      daySchedule: sleep,
      dayAncres: [sport],
    })
    expect(verdict.status).toBe('denied')
    // Le dernier trou libre finit à 23 h (1380) : 60 min tiennent à 22 h.
    expect(verdict.alternative).toMatchObject({ minutes: 60, startMinute: 1320 })
  })
})

describe('E.5 — recalcul de la semaine', () => {
  it('densité ≤ 1 partout → accordée directement, sans contrepartie', () => {
    const verdict = evaluateRequest({
      request: { type: 'rest', minutes: 60, date: '2026-08-11' },
      tasks: [{ deadline: '2026-08-12', remainingMinutes: 400 }],
      dailyCapacity: capacity,
      today: '2026-08-11',
    })
    expect(verdict.status).toBe('granted')
    expect(verdict.grantedMinutes).toBe(60)
  })

  it('densité qui dépasserait 1 → jamais accordée telle quelle, mais la plus grande version sûre', () => {
    // 550 min de travail pour 600 de capacité : 50 min de jeu, pas 120.
    const verdict = evaluateRequest({
      request: { type: 'free_time', minutes: 120, date: '2026-08-11' },
      tasks: [{ deadline: '2026-08-12', remainingMinutes: 550 }],
      dailyCapacity: capacity,
      today: '2026-08-11',
    })
    expect(verdict.status).toBe('partial')
    expect(verdict.grantedMinutes).toBe(50)
    expect(verdict.safeVersion).toMatchObject({ minutes: 50 })
    expect(verdict.deficitMinutes).toBeGreaterThan(0)
  })

  it('aucune minute libre → refus net, et la marge n’est jamais proposée en échange', () => {
    const verdict = evaluateRequest({
      request: { type: 'free_time', minutes: 120, date: '2026-08-11' },
      tasks: [{ deadline: '2026-08-12', remainingMinutes: 600 }],
      dailyCapacity: capacity,
      today: '2026-08-11',
    })
    expect(verdict.status).toBe('denied')
    expect(verdict.grantedMinutes).toBe(0)
    expect(verdict.safeVersion).toBeUndefined()
    expect(verdict.reason).toContain('marge')
  })

  it('CRITÈRE 4 : aucune version du verdict ne dépasse la marge prouvée', () => {
    // Quelle que soit la demande, la part accordée laisse toujours la densité ≤ 1.
    for (const minutes of [30, 90, 240, 600]) {
      const verdict = evaluateRequest({
        request: { type: 'rest', minutes, date: '2026-08-11' },
        tasks: [{ deadline: '2026-08-12', remainingMinutes: 520 }],
        dailyCapacity: capacity,
        today: '2026-08-11',
      })
      expect(verdict.grantedMinutes).toBeLessThanOrEqual(80)
    }
  })
})
