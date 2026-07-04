import { describe, expect, it } from 'vitest'
import { buildDayTimeline } from './day-timeline-builder'
import { calculateRawFreeTime } from './raw-free-time-engine'
import { createComputedSegment } from './planning-time-utils'

const date = '2026-06-22'

describe('raw-free-time-engine', () => {
  it('calcule les trous libres sans les classifier', () => {
    const timeline = buildDayTimeline({
      date,
      normalizedScheduleSegments: [
        createComputedSegment({ date, startMinute: 540, endMinute: 600, kind: 'school', label: 'École', locked: true }),
        createComputedSegment({ date, startMinute: 900, endMinute: 960, kind: 'work', label: 'Travail', locked: true }),
      ],
    })

    const raw = calculateRawFreeTime(timeline)

    expect(raw.rawFreeWindows).toHaveLength(3)
    expect(raw.rawFreeMinutes).toBe(1320)
  })

  it('retourne 0 minute libre pour une journée pleine', () => {
    const timeline = buildDayTimeline({
      date,
      normalizedScheduleSegments: [
        createComputedSegment({ date, startMinute: 0, endMinute: 1440, kind: 'blocked', label: 'Journée pleine', locked: true }),
      ],
    })

    expect(calculateRawFreeTime(timeline).rawFreeMinutes).toBe(0)
  })
})
