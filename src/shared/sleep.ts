import type { ScheduleEntry } from './schemas'

/**
 * Le sommeil, source unique.
 *
 * Les heures de coucher/lever vivent dans les paramètres. Tout le reste en
 * dérive : les entrées d'emploi du temps qui sortent le sommeil de la capacité
 * brute (A.1), et le garde-fou qui interdit toute notification pendant ces
 * heures (critère 3). Deux définitions du sommeil, c'était une de trop.
 */

export const SLEEP_COLOR = '#4C566A'
export const SLEEP_LABEL = 'Sleep'

/** « 23:30 » → 1410. Null si la chaîne n'est pas une heure valide. */
export function parseHHMM(value: string | undefined | null): number | null {
  if (!value) return null
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

/**
 * Les plages de sommeil d'une journée, en minutes depuis minuit.
 * Un coucher après le lever traverse minuit : la nuit se lit alors en deux
 * morceaux, la fin de soirée et le début de matinée.
 */
export function sleepIntervals(
  sleepStart: string | undefined,
  sleepEnd: string | undefined,
): Array<{ startMinute: number; endMinute: number }> {
  const start = parseHHMM(sleepStart)
  const end = parseHHMM(sleepEnd)
  if (start === null || end === null || start === end) return []

  if (start < end) return [{ startMinute: start, endMinute: end }]
  return [
    ...(end > 0 ? [{ startMinute: 0, endMinute: end }] : []),
    ...(start < 1440 ? [{ startMinute: start, endMinute: 1440 }] : []),
  ]
}

/** Les entrées d'emploi du temps correspondantes, pour les sept jours. */
export function sleepScheduleEntries(
  sleepStart: string | undefined,
  sleepEnd: string | undefined,
): ScheduleEntry[] {
  const intervals = sleepIntervals(sleepStart, sleepEnd)
  return Array.from({ length: 7 }, (_, dayOfWeek) =>
    intervals.map((i) => ({
      dayOfWeek,
      startMinute: i.startMinute,
      endMinute: i.endMinute,
      categoryType: 'sleep' as const,
      label: SLEEP_LABEL,
      color: SLEEP_COLOR,
    })),
  ).flat()
}

/**
 * Critère 3 : aucune notification, aucune action, pendant les heures de
 * sommeil — aucune exception, à aucun niveau.
 */
export function isWithinSleep(
  now: Date,
  sleepStart: string | undefined,
  sleepEnd: string | undefined,
): boolean {
  const minute = now.getHours() * 60 + now.getMinutes()
  return sleepIntervals(sleepStart, sleepEnd).some((i) => minute >= i.startMinute && minute < i.endMinute)
}
