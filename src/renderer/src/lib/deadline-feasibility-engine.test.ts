import { describe, expect, it } from 'vitest'
import { calculateDeadlinePressure } from './deadline-feasibility-engine'

const NOW = new Date('2026-06-25T12:00:00.000Z')

describe('deadline-feasibility-engine', () => {
  it('traite une deadline aujourd’hui avec heure future comme encore faisable mais urgente', () => {
    const result = calculateDeadlinePressure({
      deadline: '2026-06-25',
      deadlineTime: '18:00',
      hasExactDeadlineTime: true,
      remainingMinutes: 120,
      usableFreeMinutesBeforeDeadline: 240,
      now: NOW,
    })

    expect(result.deadlinePassed).toBe(false)
    expect(result.minutesUntilDeadline).toBeGreaterThan(0)
    expect(result.status).not.toBe('overdue')
    expect(result.urgencyScore).toBeGreaterThanOrEqual(70)
  })

  it('détecte une deadline passée', () => {
    const result = calculateDeadlinePressure({
      deadline: '2026-06-24',
      remainingMinutes: 60,
      now: NOW,
    })

    expect(result.deadlinePassed).toBe(true)
    expect(result.status).toBe('overdue')
    expect(result.urgencyScore).toBe(100)
  })

  it('gère une tâche sans deadline', () => {
    const result = calculateDeadlinePressure({
      remainingMinutes: 60,
      now: NOW,
    })

    expect(result.status).toBe('no_deadline')
    expect(result.urgencyScore).toBeLessThan(35)
  })

  it('marque critique/impossible si le travail dépasse le temps libre', () => {
    const result = calculateDeadlinePressure({
      deadline: '2026-06-26',
      remainingMinutes: 300,
      usableFreeMinutesBeforeDeadline: 120,
      now: NOW,
    })

    expect(['critical', 'impossible']).toContain(result.status)
    expect(result.deadlinePressureScore).toBeGreaterThanOrEqual(90)
  })

  it('reste safe si le travail rentre largement dans le temps disponible', () => {
    const result = calculateDeadlinePressure({
      deadline: '2026-06-30',
      remainingMinutes: 30,
      usableFreeMinutesBeforeDeadline: 240,
      now: NOW,
    })

    expect(result.status).toBe('safe')
    expect(result.feasibilityScore).toBeGreaterThan(60)
  })

  it('détecte aucun temps libre avant deadline', () => {
    const result = calculateDeadlinePressure({
      deadline: '2026-06-26',
      remainingMinutes: 60,
      usableFreeMinutesBeforeDeadline: 0,
      now: NOW,
    })

    expect(result.status).toBe('impossible')
    expect(result.feasibilityScore).toBeLessThan(15)
  })
})
