import type { ScheduleEntry } from '@/lib/planning/types'

/**
 * Édition directe de l'emploi du temps sur la grille.
 *
 * Les entrées n'ont pas d'identifiant : elles sont identifiées par leur rang
 * dans le tableau, et le store réécrit le tableau entier à chaque changement.
 * C'est suffisant ici, et ça évite d'inventer une identité qui n'existe nulle
 * part ailleurs dans le modèle.
 */

/** Aimantation au quart d'heure. Personne ne déclare un cours à 8 h 07. */
export function snapTo15(minute: number): number {
  return Math.round(minute / 15) * 15
}

/**
 * Deux occupations ne peuvent pas se recouvrir le même jour. `ignoreIndex`
 * exclut l'entrée qu'on est en train de redimensionner.
 */
export function hasOverlap(
  entries: ScheduleEntry[],
  candidate: { dayOfWeek: number; startMinute: number; endMinute: number },
  ignoreIndex?: number,
): boolean {
  return entries.some(
    (e, i) =>
      i !== ignoreIndex &&
      e.dayOfWeek === candidate.dayOfWeek &&
      candidate.startMinute < e.endMinute &&
      e.startMinute < candidate.endMinute,
  )
}

export function replaceEntry(
  entries: ScheduleEntry[],
  index: number,
  patch: Partial<ScheduleEntry>,
): ScheduleEntry[] {
  return entries.map((e, i) => (i === index ? { ...e, ...patch } : e))
}

export function removeEntry(entries: ScheduleEntry[], index: number): ScheduleEntry[] {
  return entries.filter((_, i) => i !== index)
}
