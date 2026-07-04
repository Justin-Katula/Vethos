import { describe, expect, it } from 'vitest'
import { buildDayTimeline } from './day-timeline-builder'
import { applyPreparationAndTransitionRules } from './preparation-transition-engine'
import { calculateRawFreeTime } from './raw-free-time-engine'
import { createComputedSegment } from './planning-time-utils'
import { calculateUsableFreeWindows } from './usable-free-time-engine'

const date = '2026-06-22'

describe('preparation-transition-engine', () => {
  it('transforme un gap avant école en préparation explicable', () => {
    const timeline = buildDayTimeline({
      date,
      normalizedScheduleSegments: [
        createComputedSegment({ date, startMinute: 0, endMinute: 480, kind: 'sleep', label: 'Sommeil', locked: true }),
        createComputedSegment({ date, startMinute: 525, endMinute: 900, kind: 'school', label: 'École', locked: true }),
      ],
    })
    const freeWindows = calculateUsableFreeWindows({
      date,
      rawFreeWindows: calculateRawFreeTime(timeline).rawFreeWindows,
      timeline,
    })

    const result = applyPreparationAndTransitionRules({ timeline, freeWindows })

    expect(result.updatedFreeWindows.some((window) => window.windowType === 'preparation_only')).toBe(true)
    expect(result.updatedTimeline.some((segment) => segment.kind === 'preparation')).toBe(true)
    expect(result.rulesApplied.some((rule) => rule.rule === 'pre_school_preparation')).toBe(true)
  })

  it('protège une transition avant sommeil', () => {
    const timeline = buildDayTimeline({
      date,
      normalizedScheduleSegments: [
        createComputedSegment({ date, startMinute: 1380, endMinute: 1440, kind: 'sleep', label: 'Sommeil', locked: true }),
      ],
    })
    const freeWindows = calculateUsableFreeWindows({
      date,
      rawFreeWindows: calculateRawFreeTime(timeline).rawFreeWindows,
      timeline,
    })

    const result = applyPreparationAndTransitionRules({ timeline, freeWindows })

    expect(result.updatedTimeline.some((segment) => segment.kind === 'transition')).toBe(true)
    expect(result.rulesApplied.some((rule) => rule.rule === 'pre_sleep_transition')).toBe(true)
  })
})
