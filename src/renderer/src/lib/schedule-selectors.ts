import type { ScheduleEntry, ScheduleState, TimeRule } from '@shared/schemas'

/** JS Date.getDay(): 0 = dimanche. On veut 0 = lundi. */
export function jsDateToDayOfWeek(d: Date): number {
  return (d.getDay() + 6) % 7
}

/** Retourne les minutes écoulées depuis 00:00 (0..1439). */
export function dateToMinuteOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes()
}

/** Retourne les minutes écoulées depuis lundi 00:00 (0..10079). */
export function dateToMinuteOfWeek(d: Date): number {
  return jsDateToDayOfWeek(d) * 1440 + dateToMinuteOfDay(d)
}

export type CurrentEntry = { entry: ScheduleEntry; rule: TimeRule }

export function getCurrentEntry(state: ScheduleState, now: Date): CurrentEntry | null {
  const dow = jsDateToDayOfWeek(now)
  const minute = dateToMinuteOfDay(now)
  for (const entry of state.entries) {
    if (entry.dayOfWeek === dow && entry.startMinute <= minute && minute < entry.endMinute) {
      const rule = state.rules.find((r) => r.id === entry.ruleId)
      if (!rule) return null
      return { entry, rule }
    }
  }
  return null
}

export type NextChange = {
  /** Minutes depuis lundi 00:00 (0..10079). */
  atMinuteOfWeek: number
  /** La règle qui DÉBUTE à ce changement, null si on entre dans du temps libre. */
  rule: TimeRule | null
}

/**
 * Trouve le prochain instant où la règle courante change.
 * - Si on est DANS une entrée : retourne sa fin (rule = null si rien ne suit immédiatement, sinon la règle qui commence pile à ce moment)
 * - Si on est en temps libre : retourne le début de la prochaine entrée
 * - Wrap au lundi suivant si rien d'ici la fin de la semaine.
 */
export function getNextChange(state: ScheduleState, now: Date): NextChange | null {
  if (state.entries.length === 0) return null
  const nowMow = dateToMinuteOfWeek(now)

  // Tableau d'événements (start = nouvelle règle, end = fin de règle)
  type Event = { atMow: number; rule: TimeRule | null }
  const events: Event[] = []
  for (const e of state.entries) {
    const rule = state.rules.find((r) => r.id === e.ruleId)
    if (!rule) continue
    events.push({ atMow: e.dayOfWeek * 1440 + e.startMinute, rule })
    events.push({ atMow: e.dayOfWeek * 1440 + e.endMinute, rule: null })
  }
  events.sort((a, b) => a.atMow - b.atMow)

  // Trouver le premier event strictement APRÈS nowMow
  for (const ev of events) {
    if (ev.atMow > nowMow) {
      // collapse : si l'event est "fin de règle X" mais qu'au même instant une autre "début de règle Y" existe, on préfère le début (la transition est sur Y)
      const sameTimeStart = events.find(
        (e) => e.atMow === ev.atMow && e.rule !== null,
      )
      return { atMinuteOfWeek: ev.atMow, rule: sameTimeStart ? sameTimeStart.rule : ev.rule }
    }
  }
  // Rien d'ici la fin de la semaine → wrap au premier event +10080
  const first = events[0]!
  return { atMinuteOfWeek: first.atMow + 10080, rule: first.rule }
}

/** Vrai si `draft` chevauche une entrée existante du même jour (hors elle-même). */
export function hasOverlap(
  entries: ScheduleEntry[],
  draft: { id?: string; dayOfWeek: number; startMinute: number; endMinute: number },
): boolean {
  return entries.some(
    (e) =>
      e.id !== draft.id &&
      e.dayOfWeek === draft.dayOfWeek &&
      !(e.endMinute <= draft.startMinute || e.startMinute >= draft.endMinute),
  )
}

/** Snap au pas de 15 minutes (arrondi inférieur). */
export function snapTo15(minute: number): number {
  return Math.floor(minute / 15) * 15
}

/** Tri des entrées d'un jour donné par startMinute. */
export function entriesForDay(
  entries: ScheduleEntry[],
  dayOfWeek: number,
): ScheduleEntry[] {
  return entries
    .filter((e) => e.dayOfWeek === dayOfWeek)
    .slice()
    .sort((a, b) => a.startMinute - b.startMinute)
}
