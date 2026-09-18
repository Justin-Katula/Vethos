// Arithmétique de dates du moteur.
//
// Toutes les dates sont des clés locales `YYYY-MM-DD`. Les conversions passent
// par midi local : `new Date('2026-08-11T00:00:00').toISOString()` renvoie le
// 10 août à l'ouest de Greenwich, ce qui décalait tout le planning d'un jour.

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/

/** Clé locale `YYYY-MM-DD` d'un instant. */
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Date locale à midi — insensible aux changements d'heure. */
export function parseDateKey(key: string): Date {
  const m = DATE_KEY.exec(key)
  if (!m) throw new Error(`Clé de date invalide : ${key}`)
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0)
}

export function addDays(key: string, days: number): string {
  const d = parseDateKey(key)
  d.setDate(d.getDate() + days)
  return dateKey(d)
}

/** Nombre de jours entiers de `from` à `to` (négatif si `to` précède). */
export function daysBetween(from: string, to: string): number {
  const ms = parseDateKey(to).getTime() - parseDateKey(from).getTime()
  return Math.round(ms / 86_400_000)
}

/** Toutes les clés de `start` à `end` inclus. Vide si `end` précède `start`. */
export function datesBetween(start: string, end: string): string[] {
  const n = daysBetween(start, end)
  if (n < 0) return []
  return Array.from({ length: n + 1 }, (_, i) => addDays(start, i))
}

/** 0=lundi … 6=dimanche. */
export function dayOfWeek(key: string): number {
  return (parseDateKey(key).getDay() + 6) % 7
}

/** Lundi de la semaine contenant `key`. */
export function startOfWeek(key: string): string {
  return addDays(key, -dayOfWeek(key))
}

/** Clé de semaine `YYYY-MM-DD` (le lundi) — utilisée pour mesurer λ (D.6). */
export function weekKey(key: string): string {
  return startOfWeek(key)
}

/**
 * Minutes entre un instant (jour + minute) et la fin du jour `deadline`.
 * La deadline échoit à la fin de sa journée : une tâche due aujourd'hui a
 * jusqu'à 23 h 59 pour être finie.
 */
export function minutesUntilEndOf(deadline: string, fromDate: string, fromMinute: number): number {
  return daysBetween(fromDate, deadline) * 1440 + 1440 - fromMinute
}
