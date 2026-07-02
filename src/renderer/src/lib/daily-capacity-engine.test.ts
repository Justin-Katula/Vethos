import { describe, expect, it } from 'vitest'
import type { DayAvailabilitySnapshot } from '@shared/planning-time-model'
import { calculateDailyCapacity } from './daily-capacity-engine'

function day(overrides: Partial<DayAvailabilitySnapshot> = {}): DayAvailabilitySnapshot {
  return {
    date: '2026-06-22',
    timeline: [],
    freeWindows: [],
    rawFreeMinutes: 300,
    usableFreeMinutes: 240,
    deepWorkMinutes: 120,
    shortGapMinutes: 0,
    recoveryMinutes: 30,
    preparationMinutes: 0,
    transitionMinutes: 0,
    tinyGapMinutes: 0,
    unusableMinutes: 60,
    status: 'healthy',
    reasons: ['test'],
    metadata: {
      modelVersion: 2,
      createdAt: '2026-06-22T00:00:00.000Z',
      updatedAt: '2026-06-22T00:00:00.000Z',
    },
    ...overrides,
  }
}

describe('daily-capacity-engine', () => {
  it('ne consomme pas 100% du temps libre utilisable', () => {
    const capacity = calculateDailyCapacity({ dayAvailability: day() })

    expect(capacity.maxWorkMinutes).toBeLessThan(240)
    expect(capacity.capacityStatus).toBe('healthy')
  })

  it('réduit fortement une journée fragmentée', () => {
    const capacity = calculateDailyCapacity({ dayAvailability: day({ status: 'fragmented', usableFreeMinutes: 180 }) })

    expect(capacity.maxWorkMinutes).toBeLessThanOrEqual(110)
    expect(capacity.reasons.some((reason) => reason.includes('fragmentée'))).toBe(true)
  })

  it('marque une journée sans temps utilisable comme surchargée', () => {
    const capacity = calculateDailyCapacity({ dayAvailability: day({ status: 'no_usable_time', usableFreeMinutes: 0 }) })

    expect(capacity.capacityStatus).toBe('overloaded')
    expect(capacity.maxWorkMinutes).toBe(0)
  })
})
