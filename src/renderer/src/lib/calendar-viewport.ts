/**
 * calendar-viewport.ts
 *
 * Fenêtre horaire visible du calendrier (réveil → coucher) et helpers de layout
 * pour la convertir en pixels. Pur, sans React. Réf. spec §8.2.
 */

export type CalendarViewport = {
  /** Minute de réveil (premier instant visible). */
  startMinute: number
  /** Minute de coucher (dernier instant visible). */
  endMinute: number
}

const FULL_DAY: CalendarViewport = { startMinute: 0, endMinute: 1440 }

function parseTimeString(value: string | undefined): number | null {
  if (!value) return null
  const m = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null
  if (h < 0 || h > 23 || min < 0 || min > 59) return null
  return h * 60 + min
}

/**
 * Dérive la fenêtre visible du calendrier à partir des réglages de sommeil.
 * `sleepStart` = heure de coucher ("HH:MM"). `sleepEnd` = heure de réveil ("HH:MM").
 * Repli journée complète (00–24) si la config est manquante, invalide, ou si le
 * sommeil n'est pas contigu sur la nuit (réveil ≥ coucher).
 */
export function viewportFromSettings(
  sleepStart: string | undefined,
  sleepEnd: string | undefined,
): CalendarViewport {
  const bedMinute = parseTimeString(sleepStart)
  const wakeMinute = parseTimeString(sleepEnd)
  if (bedMinute === null || wakeMinute === null) return FULL_DAY
  if (wakeMinute >= bedMinute) return FULL_DAY
  return { startMinute: wakeMinute, endMinute: bedMinute }
}

/** Hauteur totale de la fenêtre en pixels. */
export function viewportHeightPx(viewport: CalendarViewport, hourHeightPx: number): number {
  const minutes = viewport.endMinute - viewport.startMinute
  return (minutes / 60) * hourHeightPx
}

/** Convertit une minute du jour (0–1439) en y (px) dans la fenêtre. */
export function minuteToYPx(viewport: CalendarViewport, minute: number, hourHeightPx: number): number {
  return ((minute - viewport.startMinute) / 60) * hourHeightPx
}

/** Convertit un y (px) dans la fenêtre en minute du jour. */
export function yPxToMinute(viewport: CalendarViewport, y: number, hourHeightPx: number): number {
  return viewport.startMinute + (y / hourHeightPx) * 60
}

/** Liste des heures rondes visibles (utile pour l'axe horaire). */
export function visibleHoursOfViewport(viewport: CalendarViewport): number[] {
  const startHour = Math.ceil(viewport.startMinute / 60)
  const endHour = Math.floor(viewport.endMinute / 60)
  const out: number[] = []
  for (let h = startHour; h <= endHour; h++) out.push(h)
  return out
}
