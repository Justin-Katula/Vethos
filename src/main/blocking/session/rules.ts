import type { BlockingHistoryEntry } from '@shared/schemas'

export type SessionRuleDecision =
  | { ok: true }
  | { ok: false; title: 'Pause obligatoire'; reason: string; restMinutes: number }

function minutes(entry: BlockingHistoryEntry): number {
  return Math.max(
    0,
    Math.round((new Date(entry.endedAt).getTime() - new Date(entry.startedAt).getTime()) / 60_000),
  )
}

function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function localDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return copy
}

export function evaluateSessionRules(args: {
  history: BlockingHistoryEntry[]
  profileId: string
  requestedMinutes: number
  now?: Date
}): SessionRuleDecision {
  const now = args.now ?? new Date()
  const todayHistory = args.history.filter((entry) => sameLocalDay(new Date(entry.endedAt), now))
  const sameProjectMinutes =
    todayHistory
      .filter((entry) => entry.profileId === args.profileId && entry.completedNormally)
      .reduce((sum, entry) => sum + minutes(entry), 0) + args.requestedMinutes
  if (sameProjectMinutes > 240) {
    return {
      ok: false,
      title: 'Pause obligatoire',
      reason: 'Maximum 4h sur le même projet atteint. Prends 1h de pause avant de continuer.',
      restMinutes: 60,
    }
  }

  const allProjectMinutes =
    todayHistory
      .filter((entry) => entry.completedNormally)
      .reduce((sum, entry) => sum + minutes(entry), 0) + args.requestedMinutes
  if (allProjectMinutes > 360) {
    return {
      ok: false,
      title: 'Pause obligatoire',
      reason: 'Maximum 6h tous projets atteint. Prends 2h de pause avant de relancer une session.',
      restMinutes: 120,
    }
  }

  const yesterday = localDateKey(addDays(now, -1))
  const dayBefore = localDateKey(addDays(now, -2))
  const daysWithFocus = new Set(
    args.history
      .filter((entry) => entry.completedNormally && minutes(entry) > 0)
      .map((entry) => localDateKey(new Date(entry.endedAt))),
  )
  if (daysWithFocus.has(yesterday) && daysWithFocus.has(dayBefore)) {
    return {
      ok: false,
      title: 'Pause obligatoire',
      reason: 'Deux jours consécutifs sans vraie pause. Aujourd’hui devient un jour libre obligatoire.',
      restMinutes: 24 * 60,
    }
  }

  return { ok: true }
}
