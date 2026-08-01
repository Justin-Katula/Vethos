import type { TimeSlot, DayCapacity, CognitiveWindow, ScheduleEntry } from './types'

// ═══ PARTIE A — TEMPS DISPONIBLE ═══════════════════════════════════════════

export const FRAGMENT_THRESHOLDS = {
  deepWork: 25,
  lightWork: 10,
  preSleepTransition: 30,
  preObligationPrep: 20,
} as const

/** A.1 : capacité_brute = 1440 − sommeil − école/travail − trajets − ancres */
export function computeRawCapacity(scheduleEntries: ScheduleEntry[]): number {
  const occupied = scheduleEntries
    .filter((e) => e.categoryType !== 'free' && e.categoryType !== 'custom')
    .reduce((sum, e) => sum + (e.endMinute - e.startMinute), 0)
  return Math.max(0, 1440 - occupied)
}

/** A.2 : filtre les créneaux libres < seuil (inutilisables). */
export function filterUsableSlots(slots: TimeSlot[], minFragment = FRAGMENT_THRESHOLDS.deepWork): TimeSlot[] {
  return slots.filter((s) => s.durationMinutes >= minFragment)
}

/** A.2 : minutes totales perdues en fragments inutilisables. */
export function computeUnusableMinutes(slots: TimeSlot[], minFragment = FRAGMENT_THRESHOLDS.deepWork): number {
  return slots.filter((s) => s.durationMinutes < minFragment).reduce((sum, s) => sum + s.durationMinutes, 0)
}

/** A.3 : capacité_effective = brute − inutilisables − repos − fatigue */
export function computeEffectiveCapacity(raw: number, unusable: number, rest: number, fatigue: number): number {
  return Math.max(0, raw - unusable - rest - fatigue)
}

/**
 * Génère les créneaux libres (TimeSlot) à partir du schedule d'un jour.
 * Les entrées occupées sont retirées de la journée (0→1440), les trous restants
 * sont les créneaux libres.
 */
export function generateFreeSlots(scheduleEntries: ScheduleEntry[]): TimeSlot[] {
  // Trier les occupations par startMinute.
  const occupied = scheduleEntries
    .filter((e) => e.categoryType !== 'free')
    .sort((a, b) => a.startMinute - b.startMinute)

  const slots: TimeSlot[] = []
  let cursor = 0

  for (const entry of occupied) {
    if (entry.startMinute > cursor) {
      slots.push({
        startMinute: cursor,
        endMinute: entry.startMinute,
        durationMinutes: entry.startMinute - cursor,
        cognitiveWindow: 'NORMALE',
      })
    }
    cursor = Math.max(cursor, entry.endMinute)
  }

  // Dernier trou de la journée.
  if (cursor < 1440) {
    slots.push({
      startMinute: cursor,
      endMinute: 1440,
      durationMinutes: 1440 - cursor,
      cognitiveWindow: 'NORMALE',
    })
  }

  return slots
}

/** A.4 : reclasser une fenêtre cognitive à partir des observations (G.2). */
export function reclassifyCognitiveWindow(
  hour: number,
  observationsByHour: Map<number, Array<{ completed: boolean }>>,
): CognitiveWindow {
  const obs = observationsByHour.get(hour) ?? []
  if (obs.length < 5) return 'NORMALE'
  const rate = obs.filter((o) => o.completed).length / obs.length
  if (rate >= 0.75) return 'PROFONDE'
  if (rate >= 0.5) return 'NORMALE'
  return 'BASSE'
}

/** A.3 : assemble un DayCapacity complet. */
export function buildDayCapacity(args: {
  date: string
  rawCapacity: number
  freeSlots: TimeSlot[]
  restReservedMinutes: number
  fatiguePenaltyMinutes: number
}): DayCapacity {
  const usable = filterUsableSlots(args.freeSlots)
  const unusable = computeUnusableMinutes(args.freeSlots)
  const effective = computeEffectiveCapacity(args.rawCapacity, unusable, args.restReservedMinutes, args.fatiguePenaltyMinutes)
  return {
    date: args.date,
    rawCapacityMinutes: args.rawCapacity,
    usableCapacityMinutes: effective,
    restReservedMinutes: args.restReservedMinutes,
    fatiguePenaltyMinutes: args.fatiguePenaltyMinutes,
    slots: usable,
  }
}
