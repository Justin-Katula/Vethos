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
  freeMinutesByDate?: Record<string, number | undefined>
}): SessionRuleDecision {
  const now = args.now ?? new Date()
  const todayHistory = args.history.filter((entry) => sameLocalDay(new Date(entry.endedAt), now))
  const sameProjectEntries = todayHistory.filter(
    (entry) => entry.profileId === args.profileId && entry.completedNormally,
  )
  const sameProjectMinutes =
    sameProjectEntries.reduce((sum, entry) => sum + minutes(entry), 0) + args.requestedMinutes
  if (sameProjectMinutes > 240) {
    const decision = restDecision({
      entries: sameProjectEntries,
      now,
      restMinutes: 60,
      reason: 'Maximum 4h sur le même projet atteint. Prends une vraie pause avant de continuer.',
    })
    if (decision) return decision
  }

  const completedEntries = todayHistory.filter((entry) => entry.completedNormally)
  const allProjectMinutes =
    completedEntries.reduce((sum, entry) => sum + minutes(entry), 0) + args.requestedMinutes
  if (allProjectMinutes > 360) {
    const decision = restDecision({
      entries: completedEntries,
      now,
      restMinutes: 120,
      reason: 'Maximum 6h tous projets atteint. Prends une vraie pause avant de relancer une session.',
    })
    if (decision) return decision
  }

  const yesterday = localDateKey(addDays(now, -1))
  const dayBefore = localDateKey(addDays(now, -2))
  const yesterdayFree = args.freeMinutesByDate?.[yesterday]
  const dayBeforeFree = args.freeMinutesByDate?.[dayBefore]
  if (yesterdayFree === 0 && dayBeforeFree === 0) {
    return {
      ok: false,
      title: 'Pause obligatoire',
      reason: 'Deux jours consécutifs sans vraie pause. Aujourd’hui devient un jour libre obligatoire.',
      restMinutes: 24 * 60,
    }
  }

  return { ok: true }
}

function restDecision(args: {
  entries: BlockingHistoryEntry[]
  now: Date
  restMinutes: number
  reason: string
}): SessionRuleDecision | null {
  const latestEndedAt = args.entries
    .map((entry) => new Date(entry.endedAt).getTime())
    .filter((time) => Number.isFinite(time))
    .sort((a, b) => b - a)[0]
  if (latestEndedAt === undefined) {
    return {
      ok: false,
      title: 'Pause obligatoire',
      reason: args.reason,
      restMinutes: args.restMinutes,
    }
  }

  const elapsedMinutes = Math.max(0, (args.now.getTime() - latestEndedAt) / 60_000)
  const remaining = Math.ceil(args.restMinutes - elapsedMinutes)
  if (remaining <= 0) return null

  return {
    ok: false,
    title: 'Pause obligatoire',
    reason: `${args.reason} Repos restant : ${remaining} min.`,
    restMinutes: remaining,
  }
}
