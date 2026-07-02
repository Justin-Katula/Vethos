import { describe, expect, it } from 'vitest'
import { buildDayTimeline } from './day-timeline-builder'
import { applyRecoveryProtection } from './recovery-protection-engine'
import { calculateRawFreeTime } from './raw-free-time-engine'
import { createComputedSegment } from './planning-time-utils'
import { calculateUsableFreeWindows } from './usable-free-time-engine'

const date = '2026-06-22'

describe('recovery-protection-engine', () => {
  it('protège 30 minutes après le travail', () => {
    const timeline = buildDayTimeline({
      date,
      normalizedScheduleSegments: [
        createComputedSegment({ date, startMinute: 480, endMinute: 960, kind: 'work', label: 'Travail', locked: true }),
      ],
    })
    const freeWindows = calculateUsableFreeWindows({
      date,
      rawFreeWindows: calculateRawFreeTime(timeline).rawFreeWindows,
      timeline,
    })

    const result = applyRecoveryProtection({ timeline, freeWindows })

    expect(result.recoverySegments.some((segment) => segment.durationMinutes === 30)).toBe(true)
    expect(result.rulesApplied.some((rule) => rule.rule === 'post_work_recovery')).toBe(true)
  })

  it('réduit prudemment le temps utilisable quand la fatigue est élevée', () => {
    const timeline = buildDayTimeline({ date, normalizedScheduleSegments: [] })
    const freeWindows = calculateUsableFreeWindows({
      date,
      rawFreeWindows: calculateRawFreeTime(timeline).rawFreeWindows,
      timeline,
    })

    const result = applyRecoveryProtection({
      timeline,
      freeWindows,
      cognitiveModel: {
        declaredChronotype: 'unknown',
        detectedChronotype: 'unknown',
        hourlyPerformance: [],
        bestDeepWorkWindows: [],
        fatigueRiskByHour: [{ hour: 0, risk: 90 }],
        updatedAt: '2026-06-22T00:00:00.000Z',
      },
    })

    expect(result.updatedFreeWindows[0]!.usableDurationMinutes).toBeLessThan(freeWindows[0]!.usableDurationMinutes)
  })
})
