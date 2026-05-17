import type { BlockingHistoryEntry } from '@shared/schemas'

/**
 * Plus longue série de jours calendaires consécutifs comptant au moins une
 * session terminée normalement. Alimente la statistique `longestStreak`.
 * Logique extraite telle quelle de l'ancien `blocking.handlers.ts` — prend
 * désormais l'historique en paramètre (le relais l'obtient via GET_STATE).
 */
export function computeLongestStreak(history: BlockingHistoryEntry[]): number {
  const days = [
    ...new Set(
      history
        .filter((entry) => entry.completedNormally)
        .map((entry) => {
          const date = new Date(entry.endedAt)
          return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
        }),
    ),
  ].sort((a, b) => a - b)

  let longest = 0
  let current = 0
  let prev: number | null = null
  for (const day of days) {
    current = prev !== null && day - prev === 86_400_000 ? current + 1 : 1
    longest = Math.max(longest, current)
    prev = day
  }
  return longest
}
