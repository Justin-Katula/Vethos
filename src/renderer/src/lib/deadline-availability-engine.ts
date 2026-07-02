import type { DeadlineAvailabilityResult, FreeTimeWindow, PlanningContextV2 } from '@shared/planning-time-model'
import { dateKeyFromDate, intervalEndMinute, intervalStartMinute, isDateKey, minuteFromTimeString, parseDateKey } from './planning-time-utils'

export type TaskSessionProfileForDeadline = {
  estimatedMinutes?: number
  minimumUsefulMinutes?: number
  requiresDeepWork?: boolean
  preferredWindowTypes?: FreeTimeWindow['windowType'][]
}

export type CalculateUsableTimeBeforeDeadlineInput = {
  deadline: string
  planningContext: PlanningContextV2
  taskSessionProfile?: TaskSessionProfileForDeadline
  now?: Date
}

function parseDeadline(value: string): { date: string; minute: number; instant: Date | null } | null {
  if (isDateKey(value)) {
    const parsed = parseDateKey(value)
    if (!parsed) return null
    parsed.setHours(23, 59, 59, 999)
    return { date: value, minute: 1440, instant: parsed }
  }

  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime())) return null
  return {
    date: dateKeyFromDate(parsed),
    minute: parsed.getHours() * 60 + parsed.getMinutes(),
    instant: parsed,
  }
}

function clippedWindowMinutes(window: FreeTimeWindow, deadlineDate: string, deadlineMinute: number): number {
  if (window.date < deadlineDate) return window.rawDurationMinutes
  if (window.date > deadlineDate) return 0
  const start = intervalStartMinute(window)
  const end = intervalEndMinute(window)
  if (start >= deadlineMinute) return 0
  return Math.max(0, Math.min(end, deadlineMinute) - start)
}

function usableClippedMinutes(window: FreeTimeWindow, deadlineDate: string, deadlineMinute: number): number {
  const clippedRaw = clippedWindowMinutes(window, deadlineDate, deadlineMinute)
  if (clippedRaw <= 0 || window.rawDurationMinutes <= 0) return 0
  return Math.min(window.usableDurationMinutes, clippedRaw)
}

function windowMatchesProfile(window: FreeTimeWindow, clippedUsable: number, profile: TaskSessionProfileForDeadline | undefined): boolean {
  if (clippedUsable <= 0) return false
  const minimum = profile?.minimumUsefulMinutes ?? 30
  if (clippedUsable < minimum) return false
  if (profile?.requiresDeepWork && !window.canHostDeepWork) return false
  if (profile?.preferredWindowTypes?.length && !profile.preferredWindowTypes.includes(window.windowType)) return false
  return window.canHostTask || Boolean(profile?.requiresDeepWork && window.canHostDeepWork)
}

export function calculateUsableTimeBeforeDeadline(input: CalculateUsableTimeBeforeDeadlineInput): DeadlineAvailabilityResult {
  const now = input.now ?? new Date()
  const parsed = parseDeadline(input.deadline)
  if (!parsed) {
    return {
      deadline: input.deadline,
      minutesUntilDeadline: 0,
      rawFreeMinutesBeforeDeadline: 0,
      usableFreeMinutesBeforeDeadline: 0,
      deepWorkMinutesBeforeDeadline: 0,
      matchingWindowMinutesBeforeDeadline: 0,
      status: 'unknown',
      reasons: ['Deadline illisible pour le moteur de disponibilité.'],
      confidence: 20,
    }
  }

  const minutesUntilDeadline = parsed.instant
    ? Math.round((parsed.instant.getTime() - now.getTime()) / 60_000)
    : Math.max(0, minuteFromTimeString(`${parsed.date}T${parsed.minute}:00`))

  if (minutesUntilDeadline < 0) {
    return {
      deadline: input.deadline,
      minutesUntilDeadline,
      rawFreeMinutesBeforeDeadline: 0,
      usableFreeMinutesBeforeDeadline: 0,
      deepWorkMinutesBeforeDeadline: 0,
      matchingWindowMinutesBeforeDeadline: 0,
      status: 'overdue',
      reasons: ['La deadline est déjà passée.'],
      confidence: 90,
    }
  }

  let rawFreeMinutesBeforeDeadline = 0
  let usableFreeMinutesBeforeDeadline = 0
  let deepWorkMinutesBeforeDeadline = 0
  let matchingWindowMinutesBeforeDeadline = 0

  for (const day of input.planningContext.days) {
    if (day.date > parsed.date) continue
    for (const window of day.freeWindows) {
      const raw = clippedWindowMinutes(window, parsed.date, parsed.minute)
      const usable = usableClippedMinutes(window, parsed.date, parsed.minute)
      rawFreeMinutesBeforeDeadline += raw
      usableFreeMinutesBeforeDeadline += usable
      if (window.canHostDeepWork) deepWorkMinutesBeforeDeadline += usable
      if (windowMatchesProfile(window, usable, input.taskSessionProfile)) matchingWindowMinutesBeforeDeadline += usable
    }
  }

  const required = input.taskSessionProfile?.estimatedMinutes ?? input.taskSessionProfile?.minimumUsefulMinutes ?? 60
  const reasons: string[] = []
  if (usableFreeMinutesBeforeDeadline <= 0) reasons.push('Aucun temps libre réellement utilisable avant la deadline.')
  if (rawFreeMinutesBeforeDeadline > usableFreeMinutesBeforeDeadline * 1.5) {
    reasons.push('Une partie du temps brut est fragmentée, protégée ou inutilisable.')
  }
  if (input.taskSessionProfile?.requiresDeepWork && deepWorkMinutesBeforeDeadline < required) {
    reasons.push('Le temps de deep work disponible avant la deadline est insuffisant.')
  }
  if (matchingWindowMinutesBeforeDeadline < required) {
    reasons.push('Il n’y a pas assez de créneaux adaptés au profil de la tâche.')
  }
  if (reasons.length === 0) reasons.push('Le temps utilisable avant la deadline semble suffisant.')

  let status: DeadlineAvailabilityResult['status'] = 'enough_time'
  if (matchingWindowMinutesBeforeDeadline <= 0 || usableFreeMinutesBeforeDeadline <= 0) status = 'impossible'
  else if (matchingWindowMinutesBeforeDeadline < required * 0.75) status = 'critical'
  else if (matchingWindowMinutesBeforeDeadline < required * 1.15) status = 'tight'

  return {
    deadline: input.deadline,
    minutesUntilDeadline,
    rawFreeMinutesBeforeDeadline,
    usableFreeMinutesBeforeDeadline,
    deepWorkMinutesBeforeDeadline,
    matchingWindowMinutesBeforeDeadline,
    status,
    reasons,
    confidence: input.planningContext.confidence,
  }
}
