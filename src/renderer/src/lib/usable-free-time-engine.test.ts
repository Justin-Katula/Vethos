import { describe, expect, it } from 'vitest'
import { buildDayTimeline } from './day-timeline-builder'
import { intervalFromMinutes, createComputedSegment } from './planning-time-utils'
import { calculateUsableFreeWindows } from './usable-free-time-engine'

const date = '2026-06-22'

describe('usable-free-time-engine', () => {
  it('classe un gap minuscule comme inutilisable', () => {
    const windows = calculateUsableFreeWindows({
      date,
      rawFreeWindows: [intervalFromMinutes(date, 100, 110)],
      timeline: [],
    })

    expect(windows[0]?.windowType).toBe('tiny')
    expect(windows[0]?.usableDurationMinutes).toBe(0)
  })

  it('reconnaît les gaps normaux et deep work', () => {
    const windows = calculateUsableFreeWindows({
      date,
      rawFreeWindows: [intervalFromMinutes(date, 100, 190), intervalFromMinutes(date, 200, 350)],
      timeline: [],
    })

    expect(windows[0]?.windowType).toBe('normal')
    expect(windows[1]?.windowType).toBe('deep_work')
    expect(windows[1]?.canHostDeepWork).toBe(true)
  })

  it('protège un gap de 45 minutes juste avant école', () => {
    const timeline = buildDayTimeline({
      date,
      normalizedScheduleSegments: [
        createComputedSegment({ date, startMinute: 525, endMinute: 900, kind: 'school', label: 'École', locked: true }),
      ],
    })
    const windows = calculateUsableFreeWindows({
      date,
      rawFreeWindows: [intervalFromMinutes(date, 480, 525)],
      timeline,
    })

    expect(windows[0]?.windowType).toBe('preparation_only')
    expect(windows[0]?.canHostTask).toBe(false)
  })
})
