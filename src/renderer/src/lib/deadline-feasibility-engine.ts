import type { DeadlineFeasibilityResult, DeadlineFeasibilityStatus } from '@shared/priority-score-model'

export type DeadlineFeasibilityInput = {
  deadline?: string | null
  deadlineTime?: string | null
  hasExactDeadlineTime?: boolean
  remainingMinutes: number
  usableFreeMinutesBeforeDeadline?: number | null
  now?: Date
  planningContext?: {
    fallbackUsableFreeMinutes?: number | null
  }
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

function localDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseLocalDate(dateStr: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(dateStr)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null
  return new Date(year, month - 1, day)
}

function parseClockMinute(value: string | null | undefined): number | null {
  if (!value) return null
  const match = /^(\d{2}):(\d{2})$/u.exec(value)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return hours * 60 + minutes
}

function daysBetweenLocalDates(fromDateStr: string, toDateStr: string): number {
  const from = parseLocalDate(fromDateStr)
  const to = parseLocalDate(toDateStr)
  if (!from || !to) return 0
  return Math.round((to.getTime() - from.getTime()) / 86_400_000)
}

function minutesUntilDeadline(args: DeadlineFeasibilityInput, now: Date): number | undefined {
  if (!args.deadline) return undefined
  const date = parseLocalDate(args.deadline)
  if (!date) return undefined
  const exactMinute = args.hasExactDeadlineTime ? parseClockMinute(args.deadlineTime) : null
  if (exactMinute !== null) {
    date.setHours(Math.floor(exactMinute / 60), exactMinute % 60, 0, 0)
  } else {
    date.setHours(23, 59, 59, 999)
  }
  return Math.round((date.getTime() - now.getTime()) / 60_000)
}

function pressureFromRatio(ratio: number | undefined): number {
  if (ratio === undefined) return 20
  if (ratio <= 0) return 0
  if (ratio >= 1.5) return 100
  if (ratio >= 1) return 90
  if (ratio >= 0.8) return 75
  if (ratio >= 0.5) return 55
  if (ratio >= 0.25) return 30
  return 12
}

function statusFromScores(args: {
  deadlinePassed: boolean
  remainingMinutes: number
  minutesUntil?: number
  ratio?: number
  pressure: number
}): DeadlineFeasibilityStatus {
  if (args.deadlinePassed && args.remainingMinutes > 0) return 'overdue'
  if (args.ratio !== undefined && args.remainingMinutes > 0 && args.ratio > 1.25) return 'impossible'
  if (args.pressure >= 90) return 'critical'
  if (args.pressure >= 70) return 'tight'
  if (args.pressure >= 45) return 'watch'
  return 'safe'
}

export function calculateDeadlinePressure(input: DeadlineFeasibilityInput): DeadlineFeasibilityResult {
  const now = input.now ?? new Date()
  const remainingMinutes = Math.max(0, input.remainingMinutes)
  const usableFreeMinutes =
    input.usableFreeMinutesBeforeDeadline ?? input.planningContext?.fallbackUsableFreeMinutes ?? null
  const reasons: string[] = []

  if (!input.deadline) {
    reasons.push('Aucune deadline directe : l’urgence vient surtout de l’importance et de la stagnation.')
    return {
      deadlinePassed: false,
      usableFreeMinutesBeforeDeadline: usableFreeMinutes ?? undefined,
      urgencyScore: remainingMinutes > 360 ? 25 : 10,
      deadlinePressureScore: usableFreeMinutes && usableFreeMinutes > 0 ? pressureFromRatio(remainingMinutes / usableFreeMinutes) : 10,
      feasibilityScore: remainingMinutes > 0 && usableFreeMinutes === 0 ? 10 : 70,
      status: 'no_deadline',
      reasons,
      debug: { advisoryOnly: true },
    }
  }

  const today = localDateKey(now)
  const diffDays = daysBetweenLocalDates(today, input.deadline)
  const minutesUntil = minutesUntilDeadline(input, now)
  const deadlinePassed = minutesUntil !== undefined ? minutesUntil < 0 : diffDays < 0
  const ratio =
    usableFreeMinutes !== null && usableFreeMinutes !== undefined && usableFreeMinutes > 0
      ? remainingMinutes / usableFreeMinutes
      : usableFreeMinutes === 0 && remainingMinutes > 0
        ? Number.POSITIVE_INFINITY
        : undefined

  if (deadlinePassed) reasons.push('La deadline est déjà passée.')
  else if (diffDays === 0) reasons.push('La deadline est aujourd’hui mais il reste encore du temps réel.')
  else if (diffDays === 1) reasons.push('La deadline est demain.')
  else if (diffDays <= 3) reasons.push('La deadline arrive bientôt.')
  if (ratio !== undefined && Number.isFinite(ratio)) {
    reasons.push(`Le travail restant représente environ ${Math.round(ratio * 100)}% du temps libre utilisable.`)
  }
  if (usableFreeMinutes === 0 && remainingMinutes > 0) {
    reasons.push('Aucun temps libre utilisable n’est disponible avant la deadline.')
  }

  let pressure = pressureFromRatio(ratio)
  if (deadlinePassed && remainingMinutes > 0) pressure = 100
  else if (diffDays === 0 && remainingMinutes > 0) pressure = Math.max(pressure, 75)
  else if (diffDays === 1 && remainingMinutes > 0) pressure = Math.max(pressure, 65)
  else if (diffDays <= 3 && remainingMinutes >= 180) pressure = Math.max(pressure, 65)

  const status = statusFromScores({
    deadlinePassed,
    remainingMinutes,
    minutesUntil,
    ratio,
    pressure,
  })
  const urgencyScore =
    status === 'overdue' || status === 'impossible'
      ? 100
      : status === 'critical'
        ? 92
        : status === 'tight'
          ? 78
          : status === 'watch'
            ? 55
            : diffDays === 0
              ? 70
              : diffDays <= 3
                ? 50
                : 25
  const feasibilityScore =
    status === 'overdue'
      ? 20
      : status === 'impossible'
        ? 5
        : clampScore(100 - pressure + (remainingMinutes <= 45 ? 15 : 0))

  return {
    deadlinePassed,
    minutesUntilDeadline: minutesUntil,
    usableFreeMinutesBeforeDeadline: usableFreeMinutes ?? undefined,
    deadlineRiskRatio: ratio === undefined || !Number.isFinite(ratio) ? undefined : ratio,
    urgencyScore: clampScore(urgencyScore),
    deadlinePressureScore: clampScore(pressure),
    feasibilityScore,
    status,
    reasons,
    debug: {
      advisoryOnly: true,
      diffDays,
      ratio,
      exactDeadlineTimeUsed: Boolean(input.hasExactDeadlineTime && input.deadlineTime),
    },
  }
}
