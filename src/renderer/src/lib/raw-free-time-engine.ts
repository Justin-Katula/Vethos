import type { DayTimelineSegment, TimeInterval } from '@shared/planning-time-model'

export type RawFreeTimeResult = {
  rawFreeWindows: TimeInterval[]
  rawFreeMinutes: number
}

export function calculateRawFreeTime(timeline: DayTimelineSegment[]): RawFreeTimeResult {
  const rawFreeWindows = timeline
    .filter((segment) => segment.kind === 'free')
    .map((segment) => ({
      start: segment.start,
      end: segment.end,
      durationMinutes: Math.max(0, segment.durationMinutes),
    }))

  return {
    rawFreeWindows,
    rawFreeMinutes: rawFreeWindows.reduce((sum, window) => sum + window.durationMinutes, 0),
  }
}
