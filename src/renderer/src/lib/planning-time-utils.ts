import type { DayTimelineSegment, PlanningBlockKind, TimeInterval } from '@shared/planning-time-model'

export const MINUTES_PER_DAY = 1440

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, value))
}

export function clampMinute(value: number): number {
  return Math.round(clampNumber(value, 0, MINUTES_PER_DAY))
}

export function floorToFive(value: number): number {
  return Math.max(0, Math.floor(value / 5) * 5)
}

export function isDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/u.test(value)
}

export function parseDateKey(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null
  return new Date(year, month - 1, day)
}

export function dateKeyFromDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const parsed = parseDateKey(dateKey)
  if (!parsed) return dateKey
  parsed.setDate(parsed.getDate() + Math.round(days))
  return dateKeyFromDate(parsed)
}

export function enumerateDateRange(startDate: string, endDate: string): string[] {
  const start = parseDateKey(startDate)
  const end = parseDateKey(endDate)
  if (!start || !end || start.getTime() > end.getTime()) return []
  const dates: string[] = []
  const cursor = new Date(start)
  while (cursor.getTime() <= end.getTime()) {
    dates.push(dateKeyFromDate(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return dates
}

export function dayOfWeekForDateKey(dateKey: string): number {
  return parseDateKey(dateKey)?.getDay() ?? 0
}

export function minutesToClock(minute: number): string {
  const safe = clampMinute(minute)
  if (safe >= MINUTES_PER_DAY) return '24:00'
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`
}

export function isoAtMinute(date: string, minute: number): string {
  return `${date}T${minutesToClock(minute)}:00.000`
}

export function minuteFromTimeString(value: string): number {
  const match = /(?:T|\b)(\d{2}):(\d{2})(?::\d{2})?/u.exec(value)
  if (!match) return 0
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0
  if (hours === 24 && minutes === 0) return MINUTES_PER_DAY
  return clampMinute(hours * 60 + minutes)
}

export function durationBetween(start: string, end: string): number {
  return Math.max(0, minuteFromTimeString(end) - minuteFromTimeString(start))
}

export function intervalFromMinutes(date: string, startMinute: number, endMinute: number): TimeInterval {
  const start = clampMinute(startMinute)
  const end = clampMinute(endMinute)
  const safeEnd = Math.max(start, end)
  return {
    start: isoAtMinute(date, start),
    end: isoAtMinute(date, safeEnd),
    durationMinutes: safeEnd - start,
  }
}

function idPart(value: string | number | undefined): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/giu, '-')
    .replace(/^-+|-+$/gu, '')
}

export function segmentId(parts: Array<string | number | undefined>): string {
  return parts.map(idPart).filter(Boolean).join(':') || 'segment'
}

export function segmentStartMinute(segment: Pick<DayTimelineSegment, 'start'>): number {
  return minuteFromTimeString(segment.start)
}

export function segmentEndMinute(segment: Pick<DayTimelineSegment, 'end'>): number {
  return minuteFromTimeString(segment.end)
}

export function intervalStartMinute(interval: Pick<TimeInterval, 'start'>): number {
  return minuteFromTimeString(interval.start)
}

export function intervalEndMinute(interval: Pick<TimeInterval, 'end'>): number {
  return minuteFromTimeString(interval.end)
}

export function segmentsOverlap(
  a: Pick<DayTimelineSegment, 'start' | 'end'>,
  b: Pick<DayTimelineSegment, 'start' | 'end'>,
): boolean {
  return segmentStartMinute(a) < segmentEndMinute(b) && segmentStartMinute(b) < segmentEndMinute(a)
}

export function sortSegments(segments: DayTimelineSegment[]): DayTimelineSegment[] {
  return segments.slice().sort((a, b) => segmentStartMinute(a) - segmentStartMinute(b) || segmentEndMinute(a) - segmentEndMinute(b))
}

export function createComputedSegment(args: {
  date: string
  startMinute: number
  endMinute: number
  kind: PlanningBlockKind
  label: string
  idSuffix?: string
  locked?: boolean
  metadata?: Record<string, unknown>
}): DayTimelineSegment {
  const interval = intervalFromMinutes(args.date, args.startMinute, args.endMinute)
  return {
    id: segmentId([args.date, args.kind, args.startMinute, args.endMinute, args.idSuffix]),
    date: args.date,
    ...interval,
    kind: args.kind,
    label: args.label,
    source: 'computed',
    locked: args.locked ?? false,
    metadata: args.metadata,
  }
}

export function totalDurationMinutes(segments: Array<Pick<DayTimelineSegment, 'durationMinutes'>>): number {
  return segments.reduce((sum, segment) => sum + Math.max(0, Math.round(segment.durationMinutes)), 0)
}

export function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

export function sumBy<T>(items: T[], selector: (item: T) => number): number {
  return items.reduce((sum, item) => sum + Math.max(0, selector(item)), 0)
}

export function isBusyKind(kind: PlanningBlockKind): boolean {
  return kind !== 'free' && kind !== 'tiny_gap' && kind !== 'unusable'
}

export function findAdjacentSegment(
  timeline: DayTimelineSegment[],
  interval: Pick<TimeInterval, 'start' | 'end'>,
  direction: 'previous' | 'next',
): DayTimelineSegment | undefined {
  const start = intervalStartMinute(interval)
  const end = intervalEndMinute(interval)
  const sorted = sortSegments(timeline)
  if (direction === 'previous') {
    return sorted
      .filter((segment) => segmentEndMinute(segment) <= start && segment.kind !== 'free')
      .sort((a, b) => segmentEndMinute(b) - segmentEndMinute(a))[0]
  }
  return sorted
    .filter((segment) => segmentStartMinute(segment) >= end && segment.kind !== 'free')
    .sort((a, b) => segmentStartMinute(a) - segmentStartMinute(b))[0]
}

export function splitFreeSegmentWithComputedBlock(
  timeline: DayTimelineSegment[],
  block: DayTimelineSegment,
): DayTimelineSegment[] {
  const blockStart = segmentStartMinute(block)
  const blockEnd = segmentEndMinute(block)
  const next: DayTimelineSegment[] = []

  for (const segment of timeline) {
    const start = segmentStartMinute(segment)
    const end = segmentEndMinute(segment)
    const canSplit = segment.kind === 'free' && start < blockEnd && blockStart < end
    if (!canSplit) {
      next.push(segment)
      continue
    }

    if (start < blockStart) {
      next.push(createComputedSegment({
        date: segment.date,
        startMinute: start,
        endMinute: blockStart,
        kind: 'free',
        label: 'Temps libre',
        idSuffix: `${segment.id}:before`,
      }))
    }
    next.push(block)
    if (blockEnd < end) {
      next.push(createComputedSegment({
        date: segment.date,
        startMinute: blockEnd,
        endMinute: end,
        kind: 'free',
        label: 'Temps libre',
        idSuffix: `${segment.id}:after`,
      }))
    }
  }

  return sortSegments(next)
}
