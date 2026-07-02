import { describe, expect, it } from 'vitest'
import type { DayAvailabilitySnapshot } from '@shared/planning-time-model'
import { buildPlanningUiDayData } from './planning-ui-data'

describe('planning-ui-data', () => {
  it('prépare des labels affichables sans contrôler l’UI réelle', () => {
    const day: DayAvailabilitySnapshot = {
      date: '2026-06-22',
      timeline: [],
      freeWindows: [],
      rawFreeMinutes: 320,
      usableFreeMinutes: 190,
      deepWorkMinutes: 105,
      shortGapMinutes: 20,
      recoveryMinutes: 30,
      preparationMinutes: 55,
      transitionMinutes: 30,
      tinyGapMinutes: 15,
      unusableMinutes: 130,
      status: 'fragmented',
      reasons: ['Journée fragmentée.'],
      metadata: { modelVersion: 2, createdAt: '2026-06-22T00:00:00.000Z', updatedAt: '2026-06-22T00:00:00.000Z' },
    }

    const ui = buildPlanningUiDayData(day)

    expect(ui.rawFreeLabel).toBe('5 h 20')
    expect(ui.usableFreeLabel).toBe('3 h 10')
    expect(ui.statusLabel).toBe('fragmented')
    expect(ui.mainExplanation).toContain('190 min')
  })
})
