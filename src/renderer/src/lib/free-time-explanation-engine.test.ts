import { describe, expect, it } from 'vitest'
import type { DayAvailabilitySnapshot, FreeTimeWindow } from '@shared/planning-time-model'
import { explainDayAvailability, explainFreeTimeWindow } from './free-time-explanation-engine'

function window(overrides: Partial<FreeTimeWindow>): FreeTimeWindow {
  return {
    id: 'w1',
    date: '2026-06-22',
    start: '2026-06-22T10:00:00.000',
    end: '2026-06-22T10:10:00.000',
    rawDurationMinutes: 10,
    usableDurationMinutes: 0,
    windowType: 'tiny',
    canHostTask: false,
    canHostDeepWork: false,
    canHostRecovery: false,
    reasons: ['Trop court.'],
    confidence: 90,
    ...overrides,
  }
}

describe('free-time-explanation-engine', () => {
  it('explique un tiny gap sans humilier', () => {
    const explanation = explainFreeTimeWindow(window({}))

    expect(explanation.title).toContain('trop court')
    expect(explanation.warnings).toContain('Vethos ne devrait pas placer une tâche sérieuse ici.')
  })

  it('explique une journée fragmentée', () => {
    const day: DayAvailabilitySnapshot = {
      date: '2026-06-22',
      timeline: [],
      freeWindows: [window({})],
      rawFreeMinutes: 180,
      usableFreeMinutes: 40,
      deepWorkMinutes: 0,
      shortGapMinutes: 40,
      recoveryMinutes: 0,
      preparationMinutes: 0,
      transitionMinutes: 0,
      tinyGapMinutes: 20,
      unusableMinutes: 140,
      status: 'fragmented',
      reasons: ['Plusieurs petits trous.'],
      metadata: { modelVersion: 2, createdAt: '2026-06-22T00:00:00.000Z', updatedAt: '2026-06-22T00:00:00.000Z' },
    }

    expect(explainDayAvailability(day).title).toContain('fragmentée')
  })
})
