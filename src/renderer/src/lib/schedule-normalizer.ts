import type { DayTimelineSegment, PlanningBlockKind } from '@shared/planning-time-model'
import type { ScheduleState, Settings, TimeRule } from '@shared/schemas'
import type { UserModel } from '@shared/user-model'
import {
  clampMinute,
  dayOfWeekForDateKey,
  intervalFromMinutes,
  parseDateKey,
  segmentEndMinute,
  segmentId,
  segmentStartMinute,
  sortSegments,
} from './planning-time-utils'

export type FixedActivityInput = {
  id?: string
  date?: string
  label: string
  startMinute: number
  endMinute: number
  kind?: PlanningBlockKind
  locked?: boolean
}

export type SleepCommitmentInput = {
  id?: string
  date?: string
  label?: string
  startMinute: number
  endMinute: number
  locked?: boolean
}

export type ExistingSessionInput = {
  id?: string
  label?: string
  start: string
  end: string
  locked?: boolean
}

export type NormalizeScheduleForDateInput = {
  date: string
  schedule?: ScheduleState | null
  fixedActivities?: FixedActivityInput[]
  sleepCommitments?: SleepCommitmentInput[]
  existingSessions?: ExistingSessionInput[]
  userModel?: UserModel | null
  settings?: Settings | null
  now?: Date
}

function ruleKind(rule: TimeRule | undefined): PlanningBlockKind | null {
  if (!rule) return 'unknown'
  if (rule.categoryType === 'free') return null
  if (rule.categoryType === 'sleep') return 'sleep'
  if (rule.categoryType === 'school') return 'school'
  if (rule.categoryType === 'work') return 'work'
  if (rule.categoryType === 'commitment' || rule.categoryType === 'custom') return 'fixed_activity'

  const name = rule.name.toLowerCase()
  if (name.includes('sommeil') || name.includes('sleep') || name.includes('dodo')) return 'sleep'
  if (name.includes('école') || name.includes('ecole') || name.includes('school') || name.includes('cours')) return 'school'
  if (name.includes('travail') || name.includes('work') || name.includes('job')) return 'work'
  if (name.includes('repas') || name.includes('meal')) return 'meal'
  if (name.includes('trajet') || name.includes('commute')) return 'commute'
  return 'fixed_activity'
}

function clockToMinute(value: string | undefined): number | null {
  if (!value) return null
  const match = /^(\d{2}):(\d{2})$/u.exec(value)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return hours * 60 + minutes
}

function segmentFromMinutes(args: {
  date: string
  id: string
  label: string
  kind: PlanningBlockKind
  source: DayTimelineSegment['source']
  startMinute: number
  endMinute: number
  locked: boolean
  metadata?: Record<string, unknown>
}): DayTimelineSegment | null {
  const startMinute = clampMinute(args.startMinute)
  const endMinute = clampMinute(args.endMinute)
  if (endMinute <= startMinute) return null
  const interval = intervalFromMinutes(args.date, startMinute, endMinute)
  return {
    id: args.id,
    date: args.date,
    ...interval,
    kind: args.kind,
    label: args.label,
    source: args.source,
    locked: args.locked,
    metadata: args.metadata,
  }
}

function sleepSegments(args: {
  date: string
  id: string
  label: string
  startMinute: number
  endMinute: number
  source: DayTimelineSegment['source']
  locked: boolean
  metadata?: Record<string, unknown>
}): DayTimelineSegment[] {
  const start = clampMinute(args.startMinute)
  const end = clampMinute(args.endMinute)
  if (start === end) return []

  if (start < end) {
    const segment = segmentFromMinutes({
      date: args.date,
      id: segmentId([args.id, args.date, 'sleep', start, end]),
      label: args.label,
      kind: 'sleep',
      source: args.source,
      startMinute: start,
      endMinute: end,
      locked: args.locked,
      metadata: args.metadata,
    })
    return segment ? [segment] : []
  }

  return [
    segmentFromMinutes({
      date: args.date,
      id: segmentId([args.id, args.date, 'sleep', start, 1440]),
      label: args.label,
      kind: 'sleep',
      source: args.source,
      startMinute: start,
      endMinute: 1440,
      locked: args.locked,
      metadata: { ...args.metadata, crossesMidnight: true, side: 'evening' },
    }),
    segmentFromMinutes({
      date: args.date,
      id: segmentId([args.id, args.date, 'sleep', 0, end]),
      label: args.label,
      kind: 'sleep',
      source: args.source,
      startMinute: 0,
      endMinute: end,
      locked: args.locked,
      metadata: { ...args.metadata, crossesMidnight: true, side: 'morning' },
    }),
  ].filter((segment): segment is DayTimelineSegment => Boolean(segment))
}

function clipExistingSessionToDate(date: string, session: ExistingSessionInput): { startMinute: number; endMinute: number } | null {
  const parsedDate = parseDateKey(date)
  const start = new Date(session.start)
  const end = new Date(session.end)
  if (!parsedDate || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) return null

  const dayStart = new Date(parsedDate)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(dayStart)
  dayEnd.setDate(dayEnd.getDate() + 1)

  const clippedStart = new Date(Math.max(start.getTime(), dayStart.getTime()))
  const clippedEnd = new Date(Math.min(end.getTime(), dayEnd.getTime()))
  if (clippedEnd <= clippedStart) return null

  const startMinute =
    clippedStart.getTime() === dayStart.getTime() ? 0 : clippedStart.getHours() * 60 + clippedStart.getMinutes()
  const endMinute =
    clippedEnd.getTime() === dayEnd.getTime() ? 1440 : clippedEnd.getHours() * 60 + clippedEnd.getMinutes()
  if (endMinute <= startMinute) return null
  return { startMinute, endMinute }
}

function markOverlaps(segments: DayTimelineSegment[]): DayTimelineSegment[] {
  const sorted = sortSegments(segments)
  let cursor = 0
  let lastId: string | undefined

  return sorted.map((segment) => {
    const start = segmentStartMinute(segment)
    const overlaps = start < cursor
    const next = overlaps
      ? {
          ...segment,
          metadata: {
            ...(segment.metadata ?? {}),
            conflict: true,
            overlapWith: lastId,
          },
        }
      : segment
    if (segmentEndMinute(segment) > cursor) {
      cursor = segmentEndMinute(segment)
      lastId = segment.id
    }
    return next
  })
}

export function normalizeScheduleForDate(input: NormalizeScheduleForDateInput): DayTimelineSegment[] {
  const date = input.date
  const dayOfWeek = dayOfWeekForDateKey(date)
  const ruleById = new Map((input.schedule?.rules ?? []).map((rule) => [rule.id, rule]))
  const segments: DayTimelineSegment[] = []

  for (const entry of input.schedule?.entries ?? []) {
    if (entry.dayOfWeek !== dayOfWeek) continue
    const rule = ruleById.get(entry.ruleId)
    const kind = ruleKind(rule)
    if (!kind) continue

    const base = {
      date,
      id: segmentId(['schedule', entry.id, date]),
      label: rule?.name ?? 'Bloc planifié',
      kind,
      source: 'schedule' as const,
      startMinute: entry.startMinute,
      endMinute: entry.endMinute,
      locked: true,
      metadata: {
        ruleId: entry.ruleId,
        entryId: entry.id,
        categoryType: rule?.categoryType,
      },
    }
    if (kind === 'sleep') {
      segments.push(...sleepSegments(base))
    } else {
      const segment = segmentFromMinutes(base)
      if (segment) segments.push(segment)
    }
  }

  const settingsSleepStart = clockToMinute(input.settings?.sleepStart)
  const settingsSleepEnd = clockToMinute(input.settings?.sleepEnd)
  if (settingsSleepStart !== null && settingsSleepEnd !== null) {
    segments.push(
      ...sleepSegments({
        date,
        id: 'settings-sleep',
        label: 'Sommeil',
        startMinute: settingsSleepStart,
        endMinute: settingsSleepEnd,
        source: 'sleep_commitment',
        locked: true,
        metadata: { sourceSetting: true },
      }),
    )
  }

  for (const sleep of input.sleepCommitments ?? []) {
    if (sleep.date && sleep.date !== date) continue
    segments.push(
      ...sleepSegments({
        date,
        id: sleep.id ?? 'sleep-commitment',
        label: sleep.label ?? 'Sommeil protégé',
        startMinute: sleep.startMinute,
        endMinute: sleep.endMinute,
        source: 'sleep_commitment',
        locked: sleep.locked ?? true,
        metadata: { commitmentId: sleep.id },
      }),
    )
  }

  for (const activity of input.fixedActivities ?? []) {
    if (activity.date && activity.date !== date) continue
    const segment = segmentFromMinutes({
      date,
      id: segmentId(['fixed', activity.id, date, activity.startMinute, activity.endMinute]),
      label: activity.label,
      kind: activity.kind ?? 'fixed_activity',
      source: 'fixed_activity',
      startMinute: activity.startMinute,
      endMinute: activity.endMinute,
      locked: activity.locked ?? true,
      metadata: { activityId: activity.id },
    })
    if (segment) segments.push(segment)
  }

  for (const session of input.existingSessions ?? []) {
    const clipped = clipExistingSessionToDate(date, session)
    if (!clipped) continue
    const segment = segmentFromMinutes({
      date,
      id: segmentId(['session', session.id, date, clipped.startMinute, clipped.endMinute]),
      label: session.label ?? 'Session existante',
      kind: 'existing_session',
      source: 'session',
      startMinute: clipped.startMinute,
      endMinute: clipped.endMinute,
      locked: session.locked ?? true,
      metadata: { sessionId: session.id },
    })
    if (segment) segments.push(segment)
  }

  void input.userModel
  void input.now

  return markOverlaps(segments)
}
