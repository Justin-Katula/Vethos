import type { TaskEstimate, DurationRealSource } from './types'
import { STUB_DURATION_SOURCE } from './types'

/**
 * Partie B — Estimation de durée (TÂCHES UNIQUEMENT).
 *
 * Ne s'applique jamais aux objectifs (cible hebdomadaire, D.4) ni aux ancres (D.3).
 *
 * B.1 Facteur de correction par référence.
 * B.2 Durée réelle (mesurée par Point 1, stub pour l'instant).
 * B.3 Démarrage à froid (O/M/P + facteurs par défaut).
 * B.4 Percentile de planification (75e pour tâches, médiane pour objectifs).
 * B.5 Découpage automatique.
 * B.6 Facteur affiché (production de fait brut, pas d'UI).
 */

// ─── B.3 Facteurs par défaut (démarrage à froid) ───────────────────────────

export const DEFAULT_FACTORS = {
  /** Travail routinier connu : ×1.4 */
  routine: 1.4,
  /** Travail nouveau/créatif : ×1.7 */
  novel: 1.7,
} as const

// ─── B.1 Facteur de correction par référence ───────────────────────────────

/**
 * Calcule le facteur de correction pour une catégorie.
 *
 * B.1 : facteur_correction(catégorie) = médiane(durée_réelle / durée_estimée)
 * sur les N dernières tâches complétées de cette catégorie.
 *
 * Si <5 observations → facteur par défaut (B.3). Si 5-9 → confiance medium.
 * Si ≥10 → confiance high.
 */
export function computeCorrectionFactor(args: {
  category: string
  /** Observations : durée estimée vs réelle pour des tâches COMPLÉTÉES de cette catégorie. */
  observations: Array<{ estimatedMinutes: number; actualMinutes: number }>
  /** Facteur par défaut si <5 obs. */
  defaultFactor?: number
}): TaskEstimate['confidence'] extends never ? never : { factor: number; confidence: 'low' | 'medium' | 'high' } {
  const { category: _category, observations, defaultFactor } = args
  const n = observations.length

  if (n < 5) {
    return { factor: defaultFactor ?? DEFAULT_FACTORS.routine, confidence: 'low' }
  }

  // Calcule les ratios durée_réelle / durée_estimée.
  const ratios = observations
    .filter((o) => o.estimatedMinutes > 0)
    .map((o) => o.actualMinutes / o.estimatedMinutes)
    .sort((a, b) => a - b)

  if (ratios.length === 0) {
    return { factor: defaultFactor ?? DEFAULT_FACTORS.routine, confidence: 'low' }
  }

  // Médiane.
  const mid = Math.floor(ratios.length / 2)
  const median = ratios.length % 2 === 0 ? (ratios[mid - 1]! + ratios[mid]!) / 2 : ratios[mid]!

  return {
    factor: Math.max(0.5, Math.min(3, median)),
    confidence: n >= 10 ? 'high' : 'medium',
  }
}

// ─── B.3 Démarrage à froid (O/M/P) ────────────────────────────────────────

/**
 * B.3 Étape 1 : durée_de_départ = (O + 4×M + P) / 6.
 * Une seule fois par nouvelle catégorie.
 *
 * @param O Optimiste (durée si tout va bien)
 * @param M Most likely (durée la plus probable)
 * @param P Pessimiste (durée si tout va mal)
 */
export function pertEstimate(O: number, M: number, P: number): number {
  return Math.round((O + 4 * M + P) / 6)
}

// ─── B.4 Percentile de planification ───────────────────────────────────────

/**
 * B.4 : Tâches à deadline → planifier au 75e percentile du facteur.
 * Objectifs → médiane (pas de deadline dure).
 *
 * Le 75e percentile est calculé sur les ratios historiques de la catégorie.
 * Si <5 obs → retourne le facteur par défaut (pas assez de données).
 */
export function planificationPercentile(args: {
  observations: Array<{ estimatedMinutes: number; actualMinutes: number }>
  percentile: number // 0.75 pour tâches, 0.50 pour objectifs
  defaultFactor?: number
}): number {
  const { observations, percentile, defaultFactor } = args
  if (observations.length < 5) return defaultFactor ?? DEFAULT_FACTORS.routine

  const ratios = observations
    .filter((o) => o.estimatedMinutes > 0)
    .map((o) => o.actualMinutes / o.estimatedMinutes)
    .sort((a, b) => a - b)

  if (ratios.length === 0) return defaultFactor ?? DEFAULT_FACTORS.routine

  // Percentile par interpolation linéaire.
  const idx = percentile * (ratios.length - 1)
  const lower = Math.floor(idx)
  const upper = Math.ceil(idx)
  const frac = idx - lower
  const value = ratios[lower]! + frac * (ratios[upper]! - ratios[lower]!)

  return Math.max(0.5, Math.min(3, value))
}

// ─── B.1 Durée planifiée ───────────────────────────────────────────────────

/**
 * B.1 : durée_planifiée = estimation_utilisateur × facteur_correction.
 *
 * Pour les tâches à deadline, utilise le 75e percentile (B.4).
 * Pour les objectifs, utilise la médiane.
 */
export function computePlannedDuration(args: {
  userEstimate: number
  correctionFactor: number
}): number {
  return Math.max(1, Math.round(args.userEstimate * args.correctionFactor))
}

// ─── B.5 Découpage automatique ─────────────────────────────────────────────

/**
 * B.5 : si durée corrigée dépasse ce qui tient dans un jour sans violer D.5,
 * découper en sous-parties.
 *
 * Garde-fou : aucune sous-partie sous le seuil de fragment minimum (A.2 = 25 min).
 *
 * Sans IA (notre cas) : découpage mécanique en blocs de 90 min max.
 *
 * @param totalMinutes Durée totale corrigée à découper.
 * @param maxBlockMinutes Taille de bloc cible (défaut 90 min, B.5/D.5).
 * @param minBlockMinutes Bloc minimum (défaut 25 min, A.2/D.5).
 * @returns Nombre de blocs + taille de chaque bloc.
 */
export function autoSplit(args: {
  totalMinutes: number
  maxBlockMinutes?: number
  minBlockMinutes?: number
}): { blocks: number[]; needsSplit: boolean } {
  const { totalMinutes } = args
  const maxBlock = args.maxBlockMinutes ?? 90
  const minBlock = args.minBlockMinutes ?? 25

  if (totalMinutes <= maxBlock) {
    return { blocks: [totalMinutes], needsSplit: false }
  }

  const blocks: number[] = []
  let remaining = totalMinutes
  while (remaining > 0) {
    if (remaining <= maxBlock && remaining >= minBlock) {
      blocks.push(remaining)
      remaining = 0
    } else if (remaining < minBlock) {
      // Trop petit pour être seul : fusionner avec le précédent.
      if (blocks.length > 0) {
        blocks[blocks.length - 1] = blocks[blocks.length - 1]! + remaining
      } else {
        blocks.push(remaining) // pas le choix, un seul bloc < min
      }
      remaining = 0
    } else {
      blocks.push(maxBlock)
      remaining -= maxBlock
    }
  }

  return { blocks, needsSplit: blocks.length > 1 }
}

// ─── Convenience : estimer une tâche complète ──────────────────────────────

/**
 * Assemble l'estimation complète d'une tâche.
 */
export function estimateTask(args: {
  taskId: string
  userEstimate: number
  category: string
  hasDeadline: boolean
  observations: Array<{ estimatedMinutes: number; actualMinutes: number }>
  durationSource?: DurationRealSource
}): TaskEstimate {
  const { taskId, userEstimate, category: _category, hasDeadline, observations, durationSource } = args
  const source = durationSource ?? STUB_DURATION_SOURCE

  // B.2 : si on a la durée réelle (Point 1), l'utiliser. Sinon, facteur.
  const actual = source.getActualMinutes(taskId)
  const { factor, confidence } = computeCorrectionFactor({
    category: _category,
    observations: actual != null
      ? [...observations, { estimatedMinutes: userEstimate, actualMinutes: actual }]
      : observations,
  })

  // B.4 : percentile différent selon deadline ou non.
  const effectiveFactor = hasDeadline
    ? planificationPercentile({ observations, percentile: 0.75, defaultFactor: factor })
    : factor // médiane (déjà fait dans computeCorrectionFactor)

  const plannedDuration = computePlannedDuration({
    userEstimate,
    correctionFactor: effectiveFactor,
  })

  return {
    taskId,
    userEstimate,
    correctionFactor: effectiveFactor,
    plannedDuration,
    confidence,
  }
}
