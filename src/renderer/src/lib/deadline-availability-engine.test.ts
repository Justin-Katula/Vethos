import { describe, expect, it } from 'vitest'
import type { DayAvailabilitySnapshot, FreeTimeWindow, PlanningContextV2 } from '@shared/planning-time-model'
import { calculateUsableTimeBeforeDeadline } from './deadline-availability-engine'

function window(overrides: Partial<FreeTimeWindow> = {}): FreeTimeWindow {
  return {
    id: 'w1',
    date: '2026-06-22',
    start: '2026-06-22T10:00:00.000',
    end: '2026-06-22T12:30:00.000',
    rawDurationMinutes: 150,
    usableDurationMinutes: 150,
    windowType: 'deep_work',
    canHostTask: true,
    canHostDeepWork: true,
    canHostRecovery: true,
    reasons: ['deep'],
    confidence: 90,
    ...overrides,
  }
}

function context(freeWindows: FreeTimeWindow[]): PlanningContextV2 {
  const day: DayAvailabilitySnapshot = {
    date: '2026-06-22',
    timeline: [],
    freeWindows,
    rawFreeMinutes: freeWindows.reduce((sum, item) => sum + item.rawDurationMinutes, 0),
    usableFreeMinutes: freeWindows.reduce((sum, item) => sum + item.usableDurationMinutes, 0),
    deepWorkMinutes: freeWindows.filter((item) => item.canHostDeepWork).reduce((sum, item) => sum + item.usableDurationMinutes, 0),
    shortGapMinutes: 0,
    recoveryMinutes: 0,
    preparationMinutes: 0,
    transitionMinutes: 0,
    tinyGapMinutes: 0,
    unusableMinutes: 0,
    status: 'healthy',
    reasons: [],
    metadata: { modelVersion: 2, createdAt: '2026-06-22T00:00:00.000Z', updatedAt: '2026-06-22T00:00:00.000Z' },
  }
  return {
    userId: 'user',
    dateRange: { startDate: '2026-06-22', endDate: '2026-06-22' },
    days: [day],
    weeklySummary: { rawFreeMinutes: day.rawFreeMinutes, usableFreeMinutes: day.usableFreeMinutes, deepWorkMinutes: day.deepWorkMinutes, recoveryMinutes: 0, overloadedDays: 0, noUsableTimeDays: 0 },
    rulesApplied: [],
    confidence: 80,
    metadata: { modelVersion: 2, createdAt: '2026-06-22T00:00:00.000Z', updatedAt: '2026-06-22T00:00:00.000Z', source: 'shadow_planning_context' },
  }
}

describe('deadline-availability-engine', () => {
  it('trouve assez de temps avant une deadline aujourd’hui', () => {
    const result = calculateUsableTimeBeforeDeadline({
      deadline: '2026-06-22T23:00:00.000',
      planningContext: context([window()]),
      taskSessionProfile: { estimatedMinutes: 120, requiresDeepWork: true },
      now: new Date('2026-06-22T08:00:00.000'),
    })

    expect(result.status).toBe('enough_time')
    expect(result.deepWorkMinutesBeforeDeadline).toBe(150)
  })

  it('refuse une deadline passée avec status overdue', () => {
    const result = calculateUsableTimeBeforeDeadline({
      deadline: '2026-06-21T23:00:00.000',
      planningContext: context([window()]),
      now: new Date('2026-06-22T08:00:00.000'),
    })

    expect(result.status).toBe('overdue')
    expect(result.minutesUntilDeadline).toBeLessThan(0)
    expect(result.usableFreeMinutesBeforeDeadline).toBe(0)
  })

  it('retourne deep_work_minutes pour une deadline suffisamment lointaine', () => {
    const result = calculateUsableTimeBeforeDeadline({
      deadline: '2026-06-22T23:00:00.000',
      planningContext: context([window()]),
      taskSessionProfile: { estimatedMinutes: 120, requiresDeepWork: true },
      now: new Date('2026-06-22T08:00:00.000'),
    })

    expect(result.deepWorkMinutesBeforeDeadline).toBe(150)
    expect(result.status).toBe('enough_time')
  })

  it('voit quand le temps brut existe mais aucun bloc adapté', () => {
    const result = calculateUsableTimeBeforeDeadline({
      deadline: '2026-06-22T23:00:00.000',
      planningContext: context([
        window({ id: 'short-1', start: '2026-06-22T10:00:00.000', end: '2026-06-22T10:20:00.000', rawDurationMinutes: 20, usableDurationMinutes: 20, windowType: 'short', canHostTask: false, canHostDeepWork: false }),
      ]),
      taskSessionProfile: { estimatedMinutes: 60, minimumUsefulMinutes: 45 },
      now: new Date('2026-06-22T08:00:00.000'),
    })

    expect(result.rawFreeMinutesBeforeDeadline).toBe(20)
    expect(result.status).toBe('impossible')
  })
})
