import type { DayTimelineSegment, PlanningBlockKind } from '@shared/planning-time-model'
import {
  MINUTES_PER_DAY,
  createComputedSegment,
  segmentEndMinute,
  segmentStartMinute,
  sortSegments,
  totalDurationMinutes,
} from './planning-time-utils'

export type BuildDayTimelineInput = {
  date: string
  normalizedScheduleSegments: DayTimelineSegment[]
  rules?: Record<string, unknown>
  now?: Date
}

const KIND_PRIORITY: Record<PlanningBlockKind, number> = {
  sleep: 100,
  school: 90,
  work: 90,
  existing_session: 80,
  blocked: 75,
  fixed_activity: 70,
  commute: 65,
  meal: 60,
  preparation: 55,
  transition: 50,
  recovery: 45,
  unknown: 20,
  unusable: 15,
  tiny_gap: 10,
  free: 0,
}

function dominantKind(a: PlanningBlockKind, b: PlanningBlockKind): PlanningBlockKind {
  return KIND_PRIORITY[b] > KIND_PRIORITY[a] ? b : a
}

function mergeBusySegments(segments: DayTimelineSegment[]): DayTimelineSegment[] {
  const sorted = sortSegments(
    segments
      .filter((segment) => segment.kind !== 'free')
      .filter((segment) => segment.durationMinutes > 0)
      .map((segment) => ({ ...segment })),
  )
  const merged: DayTimelineSegment[] = []

  for (const segment of sorted) {
    const last = merged[merged.length - 1]
    if (!last || segmentStartMinute(segment) >= segmentEndMinute(last)) {
      merged.push(segment)
      continue
    }

    const endMinute = Math.max(segmentEndMinute(last), segmentEndMinute(segment))
    const kind = dominantKind(last.kind, segment.kind)
    const labels = Array.from(new Set([last.label, segment.label].filter(Boolean))).join(' + ')
    merged[merged.length - 1] = {
      ...last,
      end: createComputedSegment({
        date: last.date,
        startMinute: segmentStartMinute(last),
        endMinute,
        kind,
        label: labels || 'Bloc occupé',
      }).end,
      durationMinutes: endMinute - segmentStartMinute(last),
      kind,
      label: labels || last.label,
      locked: last.locked || segment.locked,
      metadata: {
        ...(last.metadata ?? {}),
        conflict: true,
        mergedSegmentIds: [
          ...((last.metadata?.mergedSegmentIds as string[] | undefined) ?? [last.id]),
          segment.id,
        ],
        mergedKinds: Array.from(
          new Set([...(last.metadata?.mergedKinds as PlanningBlockKind[] | undefined ?? [last.kind]), segment.kind]),
        ),
      },
    }
  }

  return merged
}

export function buildDayTimeline(input: BuildDayTimelineInput): DayTimelineSegment[] {
  const busySegments = mergeBusySegments(input.normalizedScheduleSegments)
  const timeline: DayTimelineSegment[] = []
  let cursor = 0

  for (const segment of busySegments) {
    const start = Math.max(cursor, segmentStartMinute(segment))
    const end = Math.min(MINUTES_PER_DAY, segmentEndMinute(segment))
    if (start > cursor) {
      timeline.push(
        createComputedSegment({
          date: input.date,
          startMinute: cursor,
          endMinute: start,
          kind: 'free',
          label: 'Temps libre',
          idSuffix: 'gap',
        }),
      )
    }
    if (end > cursor) {
      const clipped = createComputedSegment({
        date: input.date,
        startMinute: start,
        endMinute: end,
        kind: segment.kind,
        label: segment.label,
      })
      timeline.push({ ...segment, start: clipped.start, end: clipped.end, durationMinutes: end - start })
      cursor = end
    }
  }

  if (cursor < MINUTES_PER_DAY) {
    timeline.push(
      createComputedSegment({
        date: input.date,
        startMinute: cursor,
        endMinute: MINUTES_PER_DAY,
        kind: 'free',
        label: 'Temps libre',
        idSuffix: 'end-gap',
      }),
    )
  }

  void input.rules
  void input.now

  const sorted = sortSegments(timeline)
  const total = totalDurationMinutes(sorted)
  if (total === MINUTES_PER_DAY) return sorted
  return sorted.map((segment, index) =>
    index === sorted.length - 1
      ? { ...segment, metadata: { ...(segment.metadata ?? {}), timelineDurationMismatch: total } }
      : segment,
  )
}
