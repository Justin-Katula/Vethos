import type { LevelsState } from '@shared/schemas'

type PassiveSleepSession = NonNullable<LevelsState['passiveSleepSessions']>[number]

export type FatigueRecoveryPlan = {
  recoveryDate: string
  reductionMinutes: number
  sleepDebtMinutes: number
}

function localDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function minuteOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes()
}

export function minutesAfterBedtime(actualSleepMinute: number, bedtimeMinute: number): number {
  const diff = (actualSleepMinute - bedtimeMinute + 1440) % 1440
  return diff <= 12 * 60 ? diff : 0
}

export function computeFatigueRecoveryPlan(args: {
  sessions: PassiveSleepSession[]
  bedtimeMinute: number | null
  now?: Date
  recoveryRatio?: number
  maxReductionMinutes?: number
}): FatigueRecoveryPlan | null {
  const bedtimeMinute = args.bedtimeMinute
  if (bedtimeMinute === null || bedtimeMinute === undefined) return null

  const now = args.now ?? new Date()
  const latest = args.sessions
    .slice()
    .sort((a, b) => Date.parse(b.wokeAt) - Date.parse(a.wokeAt))[0]
  if (!latest) return null

  const wokeAt = new Date(latest.wokeAt)
  if (!Number.isFinite(wokeAt.getTime())) return null
  if (now.getTime() - wokeAt.getTime() > 36 * 60 * 60 * 1000) return null

  const sleepStartedAt = new Date(latest.sleepStartedAt)
  if (!Number.isFinite(sleepStartedAt.getTime())) return null

  const sleepDebtMinutes = minutesAfterBedtime(minuteOfDay(sleepStartedAt), bedtimeMinute)
  if (sleepDebtMinutes < 15) return null

  const ratio = args.recoveryRatio ?? 0.5
  const maxReductionMinutes = args.maxReductionMinutes ?? 120
  const reductionMinutes = Math.min(
    maxReductionMinutes,
    Math.ceil((sleepDebtMinutes * ratio) / 15) * 15,
  )
  if (reductionMinutes <= 0) return null

  return {
    recoveryDate: localDateKey(wokeAt),
    reductionMinutes,
    sleepDebtMinutes,
  }
}
