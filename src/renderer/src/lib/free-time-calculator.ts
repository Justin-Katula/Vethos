/**
 * free-time-calculator.ts
 *
 * Calcule le temps libre de l'utilisateur à partir de son emploi du temps
 * (schedule entries). Fonctions purement géométriques, indépendantes du
 * système de niveaux ou de tout moteur de planification.
 *
 * Règles spéciales :
 *   - Si < 1h01 (61 min) entre une activité fixe et école/travail → préparation, pas temps libre
 *   - Si trajet retour → sommeil : max 30 min de transition
 */

import type { ScheduleEntry, TimeRule } from '@shared/schemas'

// ─── Types ──────────────────────────────────────────────────────────────────

export type FreeTimeSlot = {
  dayOfWeek: number
  startMinute: number
  endMinute: number
  durationMinutes: number
  /** true si ce créneau est trop court pour être du vrai temps libre (préparation) */
  isPreparation: boolean
}

// ─── Calcul des créneaux libres ─────────────────────────────────────────────

/** Identifie si une règle est une activité fixe (école, travail, sommeil). */
function isFixedActivity(rule: TimeRule): boolean {
  if (rule.categoryType) {
    return ['sleep', 'school', 'work', 'commitment'].includes(rule.categoryType)
  }
  const n = rule.name.toLowerCase()
  return (
    n.includes('école') ||
    n.includes('ecole') ||
    n.includes('school') ||
    n.includes('travail') ||
    n.includes('work') ||
    n.includes('job') ||
    n.includes('sommeil') ||
    n.includes('sleep') ||
    n.includes('dodo') ||
    n.includes('cours') ||
    n.includes('class')
  )
}

/** Identifie si une règle est du sommeil. */
function isSleepRule(rule: TimeRule): boolean {
  if (rule.categoryType) return rule.categoryType === 'sleep'
  const n = rule.name.toLowerCase()
  return n.includes('sommeil') || n.includes('sleep') || n.includes('dodo')
}

function isSchoolOrWorkRule(rule: TimeRule): boolean {
  if (rule.categoryType) return rule.categoryType === 'school' || rule.categoryType === 'work'
  const n = rule.name.toLowerCase()
  return (
    n.includes('école') ||
    n.includes('ecole') ||
    n.includes('school') ||
    n.includes('travail') ||
    n.includes('work') ||
    n.includes('job') ||
    n.includes('cours') ||
    n.includes('class')
  )
}

function isFreeRule(rule: TimeRule): boolean {
  if (rule.categoryType) return rule.categoryType === 'free'
  const n = rule.name.toLowerCase()
  return n.includes('temps libre') || n.includes('free time')
}

/**
 * Calcule tous les créneaux de temps libre pour un jour donné.
 * Applique les règles de préparation et de transition.
 */
export function computeFreeTimeSlots(
  dayOfWeek: number,
  entries: ScheduleEntry[],
  rules: TimeRule[],
): FreeTimeSlot[] {
  const ruleById = new Map(rules.map((r) => [r.id, r]))
  const dayEntries = entries
    .filter((e) => {
      if (e.dayOfWeek !== dayOfWeek) return false
      const rule = ruleById.get(e.ruleId)
      if (!rule || isFreeRule(rule)) return false
      return isFixedActivity(rule)
    })
    .sort((a, b) => a.startMinute - b.startMinute)

  if (dayEntries.length === 0) {
    return [
      { dayOfWeek, startMinute: 0, endMinute: 1440, durationMinutes: 1440, isPreparation: false },
    ]
  }

  const slots: FreeTimeSlot[] = []

  // Créneaux entre les activités
  let cursor = 0
  for (const entry of dayEntries) {
    if (entry.startMinute > cursor) {
      const gap = entry.startMinute - cursor
      slots.push({
        dayOfWeek,
        startMinute: cursor,
        endMinute: entry.startMinute,
        durationMinutes: gap,
        isPreparation: false,
      })
    }
    cursor = Math.max(cursor, entry.endMinute)
  }
  // Créneau après la dernière activité
  if (cursor < 1440) {
    slots.push({
      dayOfWeek,
      startMinute: cursor,
      endMinute: 1440,
      durationMinutes: 1440 - cursor,
      isPreparation: false,
    })
  }

  // Appliquer les règles de préparation
  for (const slot of slots) {
    // Trouver l'activité qui suit ce créneau
    const nextEntry = dayEntries.find((e) => e.startMinute >= slot.endMinute)
    const nextRule = nextEntry ? ruleById.get(nextEntry.ruleId) : null

    // Trouver l'activité qui précède ce créneau
    const prevEntry = [...dayEntries].reverse().find((e) => e.endMinute <= slot.startMinute)
    const prevRule = prevEntry ? ruleById.get(prevEntry.ruleId) : null

    // Règle : si < 1h01 avant école/travail → préparation, pas temps libre.
    if (nextRule && isSchoolOrWorkRule(nextRule)) {
      if (slot.durationMinutes < 61) {
        slot.isPreparation = true
      }
    }

    // Règle : transition vers sommeil → soustraire au maximum 30 min juste avant le sommeil.
    if (nextRule && isSleepRule(nextRule)) {
      const transition = Math.min(30, slot.durationMinutes)
      slot.endMinute -= transition
      slot.durationMinutes -= transition
      if (slot.durationMinutes <= 0) {
        slot.isPreparation = true
      }
    }

    if (prevRule && isFixedActivity(prevRule) && slot.durationMinutes <= 0) {
      slot.isPreparation = true
    }
  }

  return slots
}

/**
 * Calcule le temps libre total pour un jour donné (en excluant les créneaux de préparation).
 */
export function computeDayFreeMinutes(
  dayOfWeek: number,
  entries: ScheduleEntry[],
  rules: TimeRule[],
): number {
  const slots = computeFreeTimeSlots(dayOfWeek, entries, rules)
  return slots.filter((s) => !s.isPreparation).reduce((sum, s) => sum + s.durationMinutes, 0)
}

/** Format du temps : heures si ≥60 min, sinon minutes */
export function formatAllocatedTime(minutes: number): string {
  const safeMinutes = Math.max(0, Math.round(minutes))
  if (safeMinutes >= 60) {
    const h = Math.floor(safeMinutes / 60)
    const m = safeMinutes % 60
    return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`
  }
  return `${safeMinutes}min`
}
