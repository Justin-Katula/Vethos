import type { TimeSlot, DayCapacity, CognitiveWindow } from './types'

/**
 * Partie A — Temps disponible.
 *
 * A.1 Capacité brute = 1440 − sommeil − école/travail/obligations − trajets − ancres.
 * A.2 Fragments inutilisables (seuils par défaut, personnalisés après 5 obs).
 * A.3 Capacité effective = brute − inutilisables − repos_réservé − pénalité_fatigue.
 * A.4 Fenêtres cognitives : départ NORMALES, reclassées avec l'usage réel (Partie G).
 */

// ─── A.2 Seuils de fragment inutilisable (valeurs de départ) ──────────────

export const FRAGMENT_THRESHOLDS = {
  /** Travail profond : fragment < 25-30 min → inutilisable. */
  deepWork: 25,
  /** Travail léger : fragment < 10 min → inutilisable. */
  lightWork: 10,
  /** Transition avant sommeil : 30 min, protégée. */
  preSleepTransition: 30,
  /** Préparation avant obligation fixe : 20 min, protégée. */
  preObligationPrep: 20,
} as const

// ─── A.4 Fenêtres cognitives par défaut ────────────────────────────────────

/** Tous les créneaux démarrent NORMAUX (confiance nulle), reclassés par G.2. */
export function defaultCognitiveWindow(_slot: TimeSlot): CognitiveWindow {
  return 'NORMALE'
}

/**
 * Reclasser une fenêtre cognitive à partir des observations réelles (G.2).
 * Si <5 observations pour cette heure → garder NORMALE (prudence).
 */
export function reclassifyCognitiveWindow(
  hour: number,
  observationsByHour: Map<number, Array<{ completed: boolean }>>,
): CognitiveWindow {
  const obs = observationsByHour.get(hour) ?? []
  if (obs.length < 5) return 'NORMALE' // G.3 : pas de conclusion sous 5 observations
  const completionRate = obs.filter((o) => o.completed).length / obs.length
  if (completionRate >= 0.75) return 'PROFONDE'
  if (completionRate >= 0.5) return 'NORMALE'
  return 'BASSE'
}

// ─── A.1 Capacité brute ────────────────────────────────────────────────────

/**
 * Calcule la capacité brute d'une journée.
 * A.1 : capacité_brute(jour) = 1440 − sommeil − école/travail/obligations fixes − trajets − ancres.
 *
 * En pratique, on reçoit les créneaux occupés (fixedSlots) et on fait
 * 1440 − somme(durées des créneaux occupés). Le sommeil n'est jamais compté
 * comme charge de travail (extrait des fixedSlots comme les autres).
 *
 * @param occupiedMinutes Total des minutes déjà occupées (sommeil + école + ancres + trajets).
 */
export function computeRawCapacity(occupiedMinutes: number): number {
  return Math.max(0, 1440 - occupiedMinutes)
}

// ─── A.2 Fragments inutilisables ───────────────────────────────────────────

/**
 * Filtre les créneaux libres pour ne garder que ceux utilisables.
 * A.2 : un fragment < seuil (selon le type de travail attendu) est inutilisable.
 *
 * @param slots Créneaux libres (déjà soustraits des obligations).
 * @param minFragment Seuil minimum en minutes (deepWork=25, lightWork=10).
 */
export function filterUsableSlots(
  slots: TimeSlot[],
  minFragment: number = FRAGMENT_THRESHOLDS.deepWork,
): TimeSlot[] {
  return slots.filter((s) => s.durationMinutes >= minFragment)
}

/**
 * Compte les minutes totales perdues en fragments inutilisables.
 */
export function computeUnusableMinutes(
  slots: TimeSlot[],
  minFragment: number = FRAGMENT_THRESHOLDS.deepWork,
): number {
  return slots
    .filter((s) => s.durationMinutes < minFragment)
    .reduce((sum, s) => sum + s.durationMinutes, 0)
}

// ─── A.3 Capacité effective ────────────────────────────────────────────────

/**
 * Calcule la capacité effective d'une journée.
 * A.3 : capacité_effective = capacité_brute − fragments_inutilisables
 *        − repos_réservé (Partie E) − pénalité_fatigue (E.4).
 *
 * C'est CE chiffRE, et lui seul, qui entre dans le test de faisabilité (Partie C).
 *
 * @param rawCapacity A.1
 * @param unusableMinutes A.2 (somme des fragments < seuil)
 * @param restReservedMinutes E.2 (plancher repos : 20% brute, min 60)
 * @param fatiguePenaltyMinutes E.4 (0 si pas de fatigue)
 */
export function computeEffectiveCapacity(
  rawCapacity: number,
  unusableMinutes: number,
  restReservedMinutes: number,
  fatiguePenaltyMinutes: number,
): number {
  return Math.max(0, rawCapacity - unusableMinutes - restReservedMinutes - fatiguePenaltyMinutes)
}

// ─── A.3 Convenience : assembler un DayCapacity complet ────────────────────

/**
 * Assemble la capacité complète d'un jour à partir de ses composantes.
 * Utilise les valeurs de départ (A.2/A.4) par défaut.
 */
export function buildDayCapacity(args: {
  date: string
  rawCapacity: number
  freeSlots: TimeSlot[]
  restReservedMinutes: number
  fatiguePenaltyMinutes: number
  minFragment?: number
}): DayCapacity {
  const { date, rawCapacity, freeSlots, restReservedMinutes, fatiguePenaltyMinutes } = args
  const minFragment = args.minFragment ?? FRAGMENT_THRESHOLDS.deepWork

  const usableSlots = filterUsableSlots(freeSlots, minFragment)
  const unusableMinutes = computeUnusableMinutes(freeSlots, minFragment)
  const effective = computeEffectiveCapacity(rawCapacity, unusableMinutes, restReservedMinutes, fatiguePenaltyMinutes)

  return {
    date,
    rawCapacityMinutes: rawCapacity,
    usableCapacityMinutes: effective,
    restReservedMinutes,
    fatiguePenaltyMinutes,
    slots: usableSlots,
  }
}
