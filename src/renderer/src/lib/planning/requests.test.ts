import { describe, it, expect } from 'vitest'
import { evaluateRequest } from './requests'

describe('Partie E.5 — requests', () => {
  it('accordée si densité reste ≤ 1', () => {
    const verdict = evaluateRequest({
      request: { type: 'rest', minutes: 60, date: '2026-07-27' },
      tasks: [{ taskId: 't1', title: 'Maths', deadline: '2026-08-01', remainingMinutes: 100 }],
      cumulativeCapacity: [{ date: '2026-07-27', capacityMinutes: 300 }],
      today: '2026-07-27',
    })
    expect(verdict.status).toBe('granted')
    expect(verdict.grantedMinutes).toBe(60)
  })

  it('refusée si densité > 1 après demande', () => {
    const verdict = evaluateRequest({
      request: { type: 'rest', minutes: 200, date: '2026-07-27' },
      tasks: [{ taskId: 't1', title: 'Maths', deadline: '2026-07-28', remainingMinutes: 150 }],
      cumulativeCapacity: [{ date: '2026-07-27', capacityMinutes: 250 }],
      today: '2026-07-27',
    })
    // Après retrait de 200 min : capacité = 50. Charge = 150. Density = 3 > 1.
    expect(verdict.status).not.toBe('granted')
    expect(verdict.deficitMinutes).toBeGreaterThan(0)
  })

  it('jamais accordée si touche règle absolue (sommeil/ancre)', () => {
    const verdict = evaluateRequest({
      request: { type: 'free_time', minutes: 120 },
      tasks: [],
      cumulativeCapacity: [{ date: '2026-07-27', capacityMinutes: 500 }],
      today: '2026-07-27',
      touchesAbsoluteRule: true,
    })
    expect(verdict.status).toBe('denied')
    expect(verdict.safeVersion).toBeDefined()
  })

  it('partial : version réduite accordée si possible', () => {
    const verdict = evaluateRequest({
      request: { type: 'rest', minutes: 100, date: '2026-07-27' },
      tasks: [{ taskId: 't1', title: 'T', deadline: '2026-07-28', remainingMinutes: 200 }],
      cumulativeCapacity: [{ date: '2026-07-27', capacityMinutes: 250 }],
      today: '2026-07-27',
    })
    // 250 - 100 = 150. Charge = 200. Density = 1.33 > 1. Déficit = 50.
    // safeMinutes = 100 - 50 = 50.
    expect(verdict.status).toBe('partial')
    expect(verdict.grantedMinutes).toBe(50)
  })
})
