/**
 * Partie E — Repos.
 *
 * Le repos est réservé AVANT la distribution, jamais ce qui reste après.
 *
 * E.1 Micro-repos entre blocs (inclus dans le bloc, pas ajouté après).
 * E.2 Plancher quotidien (20% brute, min 60 min, intouchable).
 * E.3 Respiration hebdomadaire (bilan cumulatif).
 * E.4 Fatigue accumulée (compteurs consécutifs, plancher de crise 60%).
 * E.5 Système de demande (dans requests.ts).
 */

// ─── E.1 Micro-repos entre blocs ───────────────────────────────────────────

/**
 * E.1 : micro-repos inclus dans le calcul du bloc (pas ajouté après).
 *   bloc 25-50 min → 5 min
 *   bloc 50-90 min → 10 min
 *   bloc 90+ min → 20 min (obligatoire)
 */
export function computeBreakMinutes(blockDuration: number): number {
  if (blockDuration >= 90) return 20
  if (blockDuration >= 50) return 10
  if (blockDuration >= 25) return 5
  return 0
}

// ─── E.2 Plancher quotidien ────────────────────────────────────────────────

/**
 * E.2 : 20% de la capacité brute, plancher absolu d'une heure.
 * Intouchable par n'importe quoi — tâche urgente, objectif, ancre.
 *
 * @param rawCapacityMinutes A.1 capacité brute.
 * @returns minutes de repos réservées (au moins 60).
 */
export function computeRestFloor(rawCapacityMinutes: number): number {
  return Math.max(60, Math.round(rawCapacityMinutes * 0.2))
}

// ─── E.3 Respiration hebdomadaire ──────────────────────────────────────────

export type WeeklyRestStatus = {
  restTakenMinutes: number
  restTargetMinutes: number
  /** Écart en minutes (négatif = manque de repos). */
  gapMinutes: number
  /** Action recommandée sur les jours restants. */
  adjustment: 'none' | 'reduced_day' | 'major_adjustment'
  /** Pourcentage de réduction pour le prochain jour (ex: 40 = réduire à 40%). */
  reductionPercent: number
}

/**
 * E.3 : comparer le repos déjà pris vs la cible hebdomadaire.
 *   repos_déjà_pris = somme(capacité_brute − temps_placé) sur jours écoulés.
 *   cible = 20% × capacité_brute_totale_semaine.
 *
 *   Repos ≥ cible → aucune intervention.
 *   Repos < cible → programmer l'ajustement sur les jours restants.
 *   Écart faible → jour réduit à 40%.
 *   Écart important (≥5 jours à >85%) → ampleur augmentée.
 */
export function computeWeeklyRest(args: {
  /** Minutes non travaillées (capacité brute − temps placé) pour chaque jour écoulé. */
  restTakenByDay: Array<{ date: string; minutes: number }>
  /** Capacité brute totale de la semaine (somme des 7 jours). */
  totalWeeklyRawCapacity: number
  /** Nombre de jours où l'utilisation a dépassé 85%. */
  highUtilizationDays: number
}): WeeklyRestStatus {
  const restTakenMinutes = args.restTakenByDay.reduce((sum, d) => sum + d.minutes, 0)
  const restTargetMinutes = Math.round(args.totalWeeklyRawCapacity * 0.2)
  const gapMinutes = restTakenMinutes - restTargetMinutes

  if (gapMinutes >= 0) {
    return { restTakenMinutes, restTargetMinutes, gapMinutes, adjustment: 'none', reductionPercent: 0 }
  }

  // Écart important : ≥5 jours à >85% cette semaine → ampleur augmentée.
  if (args.highUtilizationDays >= 5) {
    return { restTakenMinutes, restTargetMinutes, gapMinutes, adjustment: 'major_adjustment', reductionPercent: 40 }
  }

  // Écart faible → jour réduit à 40%.
  return { restTakenMinutes, restTargetMinutes, gapMinutes, adjustment: 'reduced_day', reductionPercent: 40 }
}

// ─── E.4 Fatigue accumulée ─────────────────────────────────────────────────

export type FatigueState = {
  /** Jours consécutifs à >85% de capacité effective. */
  consecutiveHighDays: number
  /** Pénalité en minutes pour aujourd'hui. */
  penaltyMinutes: number
  /** Pourcentage de réduction appliqué. */
  reductionPercent: number
  /** Plancher de crise (jamais sous 60% de la capacité normale). */
  crisisFloorPercent: number
}

/**
 * E.4 : fatigue accumulée (TOUJOURS sur capacité EFFECTIVE, jamais brute).
 *
 *   2 jours consécutifs >85% → jour 3 réduit de 25%
 *   3 jours consécutifs → jour 4 forcé en respiration (max 40%)
 *   1 jour <50% → compteur remis à zéro
 *
 * Crise réellement prouvée (densité > 1) : peut réduire PARTIELLEMENT cette
 * protection, jamais l'annuler. Plancher absolu même en crise : jamais sous
 * 60% de la capacité normale.
 *
 * @param consecutiveHighDays Nombre de jours consécutifs à >85%.
 * @param effectiveCapacityMinutes Capacité effective du jour (avant pénalité).
 * @param isCrisis True si densité > 1 (C.2).
 */
export function computeFatigue(args: {
  consecutiveHighDays: number
  effectiveCapacityMinutes: number
  isCrisis?: boolean
}): FatigueState {
  const { consecutiveHighDays, effectiveCapacityMinutes, isCrisis = false } = args

  let reductionPercent = 0
  let penaltyMinutes = 0

  if (consecutiveHighDays >= 3) {
    // Jour 4 forcé en respiration (max 40% → réduction de 60%).
    reductionPercent = 60
  } else if (consecutiveHighDays >= 2) {
    // Jour 3 réduit de 25%.
    reductionPercent = 25
  }

  if (reductionPercent > 0) {
    penaltyMinutes = Math.round(effectiveCapacityMinutes * (reductionPercent / 100))
    // Plancher de crise : même en crise, jamais sous 60% de la capacité normale.
    if (isCrisis) {
      const maxReductionPercent = 40 // 100% - 60% = 40% max reduction en crise
      reductionPercent = Math.min(reductionPercent, maxReductionPercent)
      penaltyMinutes = Math.round(effectiveCapacityMinutes * (reductionPercent / 100))
    }
  }

  return {
    consecutiveHighDays,
    penaltyMinutes,
    reductionPercent,
    crisisFloorPercent: 60,
  }
}

/**
 * E.4 : détermine si le compteur doit être remis à zéro.
 * 1 jour <50% d'utilisation → compteur remis à zéro.
 */
export function shouldResetFatigue(utilizationPercent: number): boolean {
  return utilizationPercent < 50
}
