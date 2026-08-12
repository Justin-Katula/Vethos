// ═══ PARTIE E — REPOS ═════════════════════════════════════════════════════
//
// Le repos est réservé AVANT la distribution. Il n'est jamais ce qui reste
// une fois le travail placé.

/**
 * E.1 : micro-repos INCLUS dans l'empreinte du bloc, jamais ajouté après.
 * Un bloc de 90 min occupe 90 min de la journée, dont 20 de pause.
 */
export function computeBreakMinutes(blockMinutes: number): number {
  if (blockMinutes >= 90) return 20
  if (blockMinutes >= 50) return 10
  if (blockMinutes >= 25) return 5
  return 0
}

/** E.2 : plancher quotidien = 20 % de la capacité brute, jamais moins d'une heure. */
export const REST_FLOOR_PERCENT = 0.2
export const REST_FLOOR_ABSOLUTE_MINUTES = 60

export function computeRestFloor(rawCapacity: number): number {
  return Math.max(REST_FLOOR_ABSOLUTE_MINUTES, Math.round(rawCapacity * REST_FLOOR_PERCENT))
}

// ─── E.3 — Respiration hebdomadaire ───────────────────────────────────────

export type WeeklyBreathing = {
  targetMinutes: number
  restTakenMinutes: number
  /** Négatif = il manque du repos. */
  gapMinutes: number
  adjustment: 'none' | 'reduced' | 'major'
  /** Jours à réduire, choisis parmi les jours restants les moins perturbés. */
  reducedDates: string[]
  /** Plafond d'utilisation imposé à ces jours. */
  capPercent: number
}

export const BREATHING_CAP_PERCENT = 40
export const HIGH_UTILIZATION_PERCENT = 85

/**
 * E.3 : sur chaque semaine glissante, compare le repos déjà pris à la cible de
 * 20 %. S'il en manque, l'application programme elle-même l'ajustement sur le
 * jour restant le moins perturbant — jamais un dimanche fixé d'avance.
 */
export function computeWeeklyBreathing(args: {
  /** Jours déjà écoulés : brut disponible et temps réellement travaillé. */
  elapsedDays: Array<{ date: string; rawCapacityMinutes: number; workedMinutes: number }>
  /** Brut total de la semaine entière (écoulée + à venir). */
  weekRawCapacityMinutes: number
  /** Jours restants, avec la charge déjà demandée sur chacun. */
  remainingDays: Array<{ date: string; demandMinutes: number }>
}): WeeklyBreathing {
  const target = Math.round(args.weekRawCapacityMinutes * REST_FLOOR_PERCENT)
  const restTaken = args.elapsedDays.reduce(
    (sum, d) => sum + Math.max(0, d.rawCapacityMinutes - d.workedMinutes),
    0,
  )
  const gap = restTaken - target

  if (gap >= 0 || args.remainingDays.length === 0) {
    return { targetMinutes: target, restTakenMinutes: restTaken, gapMinutes: gap, adjustment: 'none', reducedDates: [], capPercent: 100 }
  }

  const highDays = args.elapsedDays.filter(
    (d) => d.rawCapacityMinutes > 0 && (d.workedMinutes / d.rawCapacityMinutes) * 100 > HIGH_UTILIZATION_PERCENT,
  ).length

  // Le jour le moins perturbant = celui qui porte le moins de charge.
  const byDisruption = [...args.remainingDays].sort(
    (a, b) => a.demandMinutes - b.demandMinutes || a.date.localeCompare(b.date),
  )
  // Écart important (≥5 jours à >85 %) → l'ampleur augmente : deux jours réduits.
  const major = highDays >= 5
  const count = Math.min(byDisruption.length, major ? 2 : 1)

  return {
    targetMinutes: target,
    restTakenMinutes: restTaken,
    gapMinutes: gap,
    adjustment: major ? 'major' : 'reduced',
    reducedDates: byDisruption.slice(0, count).map((d) => d.date),
    capPercent: BREATHING_CAP_PERCENT,
  }
}

// ─── E.4 — Fatigue accumulée ──────────────────────────────────────────────
//
// Tous les calculs portent sur la capacité EFFECTIVE, jamais sur la brute.

export type FatigueState = {
  consecutiveHighDays: number
  reductionPercent: number
  penaltyMinutes: number
  /** Vrai quand une crise prouvée a rogné la protection sans l'annuler. */
  crisisReduced: boolean
}

export const FATIGUE_CRISIS_FLOOR_PERCENT = 60

/**
 * Compte les jours consécutifs au-dessus de 85 % d'utilisation, en remontant
 * depuis le plus récent. Un jour sous 50 % remet le compteur à zéro.
 */
export function countConsecutiveHighDays(utilizationDescending: number[]): number {
  let count = 0
  for (const u of utilizationDescending) {
    if (u < 50) break
    if (u > HIGH_UTILIZATION_PERCENT) count++
    else break
  }
  return count
}

/**
 * E.4 : 2 jours consécutifs >85 % → jour suivant réduit de 25 %.
 *       3 jours consécutifs → jour suivant plafonné à 40 % (réduction de 60 %).
 * Une crise prouvée peut rogner cette protection, jamais l'annuler : la
 * capacité ne descend jamais sous 60 % de la normale.
 */
export function computeFatigue(args: {
  consecutiveHighDays: number
  effectiveCapacityBeforePenalty: number
  isCrisis?: boolean
}): FatigueState {
  let reduction = 0
  if (args.consecutiveHighDays >= 3) reduction = 100 - 40
  else if (args.consecutiveHighDays >= 2) reduction = 25

  let crisisReduced = false
  if (reduction > 0 && args.isCrisis) {
    const maxReduction = 100 - FATIGUE_CRISIS_FLOOR_PERCENT
    if (reduction > maxReduction) {
      reduction = maxReduction
      crisisReduced = true
    }
  }

  return {
    consecutiveHighDays: args.consecutiveHighDays,
    reductionPercent: reduction,
    penaltyMinutes: Math.round(args.effectiveCapacityBeforePenalty * (reduction / 100)),
    crisisReduced,
  }
}

/** E.4 : un jour sous 50 % d'utilisation remet le compteur à zéro. */
export function shouldResetFatigue(utilizationPercent: number): boolean {
  return utilizationPercent < 50
}
