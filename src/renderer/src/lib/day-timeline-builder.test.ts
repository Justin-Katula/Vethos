import { describe, expect, it } from 'vitest'
import { buildDayTimeline } from './day-timeline-builder'
import { createComputedSegment, segmentEndMinute, segmentStartMinute, totalDurationMinutes } from './planning-time-utils'

const date = '2026-06-22'

describe('day-timeline-builder', () => {
  it('construit une timeline complète de 24h avec les gaps libres', () => {
    const timeline = buildDayTimeline({
      date,
      normalizedScheduleSegments: [
        createComputedSegment({ date, startMinute: 540, endMinute: 600, kind: 'school', label: 'École', locked: true }),
      ],
    })

    expect(totalDurationMinutes(timeline)).toBe(1440)
    expect(timeline.map((segment) => segment.kind)).toEqual(['free', 'school', 'free'])
  })

  it('retourne des blocs triés sans overlap final', () => {
    const timeline = buildDayTimeline({
      date,
      normalizedScheduleSegments: [
        createComputedSegment({ date, startMinute: 600, endMinute: 720, kind: 'work', label: 'Travail', locked: true }),
        createComputedSegment({ date, startMinute: 540, endMinute: 660, kind: 'school', label: 'École', locked: true }),
      ],
    })

    for (let index = 1; index < timeline.length; index += 1) {
      expect(segmentEndMinute(timeline[index - 1]!) <= segmentStartMinute(timeline[index]!)).toBe(true)
    }
    expect(totalDurationMinutes(timeline)).toBe(1440)
  })
})
