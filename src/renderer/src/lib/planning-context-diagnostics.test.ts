import { describe, expect, it } from 'vitest'
import type { DayAvailabilitySnapshot, PlanningContextV2 } from '@shared/planning-time-model'
import { runPlanningContextDiagnostics } from './planning-context-diagnostics'
import { createComputedSegment } from './planning-time-utils'

function context(day: DayAvailabilitySnapshot): PlanningContextV2 {
  return {
    userId: 'user',
    dateRange: { startDate: day.date, endDate: day.date },
    days: [day],
    weeklySummary: { rawFreeMinutes: day.rawFreeMinutes, usableFreeMinutes: day.usableFreeMinutes, deepWorkMinutes: day.deepWorkMinutes, recoveryMinutes: day.recoveryMinutes, overloadedDays: 0, noUsableTimeDays: day.usableFreeMinutes <= 0 ? 1 : 0 },
    rulesApplied: [],
    confidence: 70,
    metadata: { modelVersion: 2, createdAt: '2026-06-22T00:00:00.000Z', updatedAt: '2026-06-22T00:00:00.000Z', source: 'planning_context_builder' },
  }
}

function day(overrides: Partial<DayAvailabilitySnapshot> = {}): DayAvailabilitySnapshot {
  const date = '2026-06-22'
  return {
    date,
    timeline: [createComputedSegment({ date, startMinute: 0, endMinute: 1440, kind: 'free', label: 'Libre' })],
    freeWindows: [],
    rawFreeMinutes: 1440,
    usableFreeMinutes: 1440,
    deepWorkMinutes: 1440,
    shortGapMinutes: 0,
    recoveryMinutes: 0,
    preparationMinutes: 0,
    transitionMinutes: 0,
    tinyGapMinutes: 0,
    unusableMinutes: 0,
    status: 'healthy',
    reasons: [],
    metadata: { modelVersion: 2, createdAt: '2026-06-22T00:00:00.000Z', updatedAt: '2026-06-22T00:00:00.000Z' },
    ...overrides,
  }
}

describe('planning-context-diagnostics', () => {
  it('détecte une timeline incomplète et le sommeil manquant', () => {
    const diagnostics = runPlanningContextDiagnostics(
      context(day({ timeline: [createComputedSegment({ date: '2026-06-22', startMinute: 0, endMinute: 60, kind: 'free', label: 'Libre' })] })),
    )

    expect(diagnostics.status).toBe('critical')
    expect(diagnostics.issues.some((issue) => issue.id === 'timeline_duration_invalid')).toBe(true)
    expect(diagnostics.issues.some((issue) => issue.id === 'missing_sleep')).toBe(true)
  })

  it('détecte un overlap', () => {
    const date = '2026-06-22'
    const diagnostics = runPlanningContextDiagnostics(
      context(day({
        timeline: [
          createComputedSegment({ date, startMinute: 0, endMinute: 120, kind: 'free', label: 'Libre' }),
          createComputedSegment({ date, startMinute: 60, endMinute: 180, kind: 'school', label: 'École' }),
          createComputedSegment({ date, startMinute: 180, endMinute: 1440, kind: 'free', label: 'Libre' }),
        ],
      })),
    )

    expect(diagnostics.issues.some((issue) => issue.id === 'timeline_overlap')).toBe(true)
  })

  it('détecte une journée sans temps utilisable', () => {
    const diagnostics = runPlanningContextDiagnostics(context(day({ usableFreeMinutes: 0, status: 'no_usable_time' })))

    expect(diagnostics.issues.some((issue) => issue.id === 'no_usable_time')).toBe(true)
  })

  it('détecte des règles contradictoires', () => {
    const d = day({
      rawFreeMinutes: 100,
      preparationMinutes: 50,
      recoveryMinutes: 40,
      transitionMinutes: 20, // Sum = 110 > 100
    })
    const diagnostics = runPlanningContextDiagnostics(context(d))

    expect(diagnostics.issues.some((issue) => issue.id === 'contradictory_rules')).toBe(true)
  })

  it('détecte une deadline availability impossible ou en retard', () => {
    const d = day()
    const ctx = context(d)
    const deadAvail: any[] = [
      { deadline: '2026-06-25T12:00:00.000Z', status: 'impossible' },
      { deadline: '2026-06-20T12:00:00.000Z', status: 'overdue' },
    ]
    const diagnostics = runPlanningContextDiagnostics(ctx, deadAvail)

    expect(diagnostics.issues.some((issue) => issue.id === 'deadline_availability_impossible')).toBe(true)
    expect(diagnostics.issues.some((issue) => issue.id === 'deadline_availability_overdue')).toBe(true)
    expect(diagnostics.status).toBe('critical')
  })
})
