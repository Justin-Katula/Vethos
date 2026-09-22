import type { DurationRealSource, LearningObservation, TaskItem } from './types'
import { STUB_DURATION_SOURCE } from './types'
import { FRAGMENT_DEFAULTS } from './capacity'

// ═══ PARTIE B — ESTIMATION DE DURÉE (TÂCHES UNIQUEMENT) ═══════════════════
//
// Ne s'applique jamais aux objectifs (cible hebdomadaire, D.4) ni aux ancres
// (durée fixe + minimum, D.3).

/** B.3 — facteurs par défaut tant que <5 tâches complétées dans la catégorie. */
export const DEFAULT_FACTORS = { routine: 1.4, novel: 1.7 } as const

/** B.1 — fenêtre des N dernières tâches complétées prises en compte. */
export const FACTOR_WINDOW = 20

/** B.4 — les tâches à deadline se planifient au 75e percentile, pas à la médiane. */
export const PLANNING_PERCENTILE = 0.75

export const MIN_FACTOR = 0.5
export const MAX_FACTOR = 3

export type FactorConfidence = 'none' | 'low' | 'medium' | 'high'

export type CorrectionFactor = {
  factor: number
  confidence: FactorConfidence
  /** Nombre d'observations réellement utilisées. */
  sampleSize: number
  reason: string
}

type Ratio = { estimatedMinutes: number; actualMinutes: number; createdAt: string }

function ratiosOf(observations: LearningObservation[], category: string): number[] {
  return (
    observations.filter(
      (o) =>
        o.category === category &&
        typeof o.estimatedMinutes === 'number' &&
        typeof o.actualMinutes === 'number' &&
        o.estimatedMinutes > 0,
    ) as Ratio[]
  )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, FACTOR_WINDOW)
    .map((o) => o.actualMinutes / o.estimatedMinutes)
}

const clamp = (n: number) => Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, n))

export function median(values: number[]): number {
  if (values.length === 0) return 0
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!
}

/** Percentile par interpolation linéaire. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const s = [...values].sort((a, b) => a - b)
  const idx = p * (s.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  return s[lo]! + (idx - lo) * (s[hi]! - s[lo]!)
}

/**
 * B.1 : facteur_correction(catégorie) = médiane(durée_réelle / durée_estimée)
 * sur les N dernières tâches complétées de cette catégorie.
 * B.3 : sous 5 tâches complétées, le défaut tient (1.4 routinier / 1.7 nouveau).
 *       Dès 5, le facteur mesuré remplace le défaut. Dès 10, confiance haute.
 */
export function computeCorrectionFactor(args: {
  observations: LearningObservation[]
  category: string
  workKind: 'routine' | 'novel'
}): CorrectionFactor {
  const ratios = ratiosOf(args.observations, args.category)
  const fallback = DEFAULT_FACTORS[args.workKind]

  // G.3 : aucune conclusion tirée de moins de 5 observations.
  if (ratios.length < 5) {
    return {
      factor: fallback,
      confidence: ratios.length === 0 ? 'none' : 'low',
      sampleSize: ratios.length,
      reason: `Default for ${args.workKind === 'novel' ? 'new or creative work' : 'known routine work'} — ${ratios.length}/5 tasks measured.`,
    }
  }

  return {
    factor: clamp(median(ratios)),
    confidence: ratios.length >= 10 ? 'high' : 'medium',
    sampleSize: ratios.length,
    reason: `Médiane mesurée sur ${ratios.length} tâches de « ${args.category} ».`,
  }
}

/**
 * B.4 : percentile de planification.
 * Tâche à deadline → 75e percentile du facteur : on réserve plus que le cas
 * moyen. Objectif → médiane, il n'y a pas de deadline dure à protéger.
 */
export function planningFactor(args: {
  observations: LearningObservation[]
  category: string
  workKind: 'routine' | 'novel'
  hasDeadline: boolean
}): CorrectionFactor {
  const base = computeCorrectionFactor(args)
  if (!args.hasDeadline || base.sampleSize < 5) return base

  const ratios = ratiosOf(args.observations, args.category)
  return {
    ...base,
    factor: clamp(percentile(ratios, PLANNING_PERCENTILE)),
    reason: `${base.reason} 75e percentile appliqué (tâche à deadline).`,
  }
}

/** B.3 étape 1 : durée_de_départ = (O + 4×M + P) / 6. */
export function pertEstimate(optimistic: number, likely: number, pessimistic: number): number {
  return Math.round((optimistic + 4 * likely + pessimistic) / 6)
}

/** B.1 : durée_planifiée = estimation_utilisateur × facteur_correction. */
export function computePlannedDuration(userEstimate: number, factor: number): number {
  return Math.max(1, Math.round(userEstimate * factor))
}

/**
 * B.2 : la durée réelle est la SOMME des sessions obligatoires mesurées.
 * Jamais une déclaration de l'utilisateur.
 */
export function actualDuration(
  taskId: string,
  source: DurationRealSource = STUB_DURATION_SOURCE,
): number | null {
  return source.getActualMinutes(taskId)
}

// ─── B.5 — Découpage automatique ──────────────────────────────────────────

export type SplitPart = { label: string; minutes: number; order: number }

/**
 * B.5 : déclenché quand la durée corrigée dépasse ce qui tient dans UN jour
 * sans violer le plafond de D.5. Toujours automatique, jamais une question.
 *
 * `labeller` est le point d'entrée de l'IA (sous-parties nommées, ordre de
 * dépendance). Absent → découpage mécanique en blocs génériques séquentiels.
 */
export function autoSplit(args: {
  totalMinutes: number
  maxPerDayMinutes: number
  minPartMinutes?: number
  labeller?: (partCount: number) => string[] | null
}): SplitPart[] {
  const minPart = args.minPartMinutes ?? FRAGMENT_DEFAULTS.deepWork
  if (args.maxPerDayMinutes <= 0 || args.totalMinutes <= args.maxPerDayMinutes) return []

  // Garde-fou : aucune sous-partie sous le seuil de fragment minimum (A.2).
  // C'est un PLAFOND sur le nombre de parts, jamais une valeur qu'on relève
  // ensuite : forcer deux parts dans une durée qui n'en supporte qu'une
  // produisait deux morceaux sous le seuil — exactement ce que B.5 interdit.
  const maxParts = Math.floor(args.totalMinutes / minPart)
  const count = Math.min(Math.ceil(args.totalMinutes / args.maxPerDayMinutes), maxParts)
  // Moins de deux parts possibles : découper violerait le seuil, donc on ne
  // découpe pas. La tâche reste entière et le moteur l'étale sur plusieurs
  // jours par ses propres règles (D.5).
  if (count < 2) return []

  const base = Math.floor(args.totalMinutes / count)
  const remainder = args.totalMinutes - base * count

  const labels = args.labeller?.(count) ?? null
  return Array.from({ length: count }, (_, i) => ({
    order: i + 1,
    label: labels?.[i] ?? `Partie ${i + 1}`,
    // Le reliquat va sur la première part : aucune part ne descend sous `base`.
    minutes: base + (i === 0 ? remainder : 0),
  }))
}

// ─── B.5.1 — Verrouillage séquentiel des parties ──────────────────────────

/** Ce qu'il faut d'une tâche pour décider de son verrouillage — rien de plus. */
type Sequenceable = Pick<TaskItem, 'parentTaskId' | 'partOrder'>

/**
 * B.5.1 : une partie reste VERROUILLÉE tant qu'une sœur de rang antérieur est
 * encore active (pas encore terminée). Verrouillée, elle s'affiche en aperçu
 * sur le calendrier mais ne déclenche ni confirmation ni blocage.
 *
 * Fait DÉRIVÉ, recalculé à chaque plan — jamais un drapeau stocké. Un drapeau
 * se désynchroniserait au premier cas non prévu : supprimer la Partie 1 au
 * lieu de la terminer laisserait la Partie 2 verrouillée pour toujours. Ici,
 * la sœur disparaît de `activeTasks` et la suivante se libère d'elle-même,
 * sans une ligne de code de plus.
 */
export function isPartLocked(task: Sequenceable, activeTasks: Sequenceable[]): boolean {
  const order = task.partOrder
  if (task.parentTaskId === null || order === null) return false
  return activeTasks.some(
    (t) =>
      t.parentTaskId === task.parentTaskId && t.partOrder !== null && t.partOrder < order,
  )
}

// ─── Assemblage ───────────────────────────────────────────────────────────

export type TaskEstimate = {
  taskId: string
  userEstimate: number
  correctionFactor: number
  plannedDuration: number
  /** Temps de session déjà mesuré (B.2), ou null si rien n'a encore été mesuré. */
  measuredMinutes: number | null
  /** Ce qu'il reste à placer : durée planifiée moins le temps déjà mesuré. */
  remainingMinutes: number
  confidence: FactorConfidence
  /** Fait brut destiné au futur point Coach (B.6) — jamais affiché ici. */
  reason: string
}

/**
 * B : estimation complète d'une tâche.
 * B.6 : produit le fait brut (facteur, raison, confiance). La livraison à
 * l'utilisateur est hors périmètre — aucune interface ici.
 */
export function estimateTask(args: {
  task: Pick<TaskItem, 'id' | 'category' | 'workKind' | 'estimatedMinutes'> &
    Partial<Pick<TaskItem, 'extraMinutes'>>
  observations: LearningObservation[]
  durationSource?: DurationRealSource
}): TaskEstimate {
  const factor = planningFactor({
    observations: args.observations,
    category: args.task.category,
    workKind: args.task.workKind,
    hasDeadline: true, // Toute tâche a une deadline ; seuls les objectifs n'en ont pas.
  })

  // B.5.2 : le temps accordé par « il m'en faut plus » s'ajoute APRÈS le
  // facteur, jamais avant. Le corriger une seconde fois gonflerait une durée
  // déjà donnée en minutes réelles par l'utilisateur qui vient de constater
  // que le temps prévu ne suffisait pas.
  const planned =
    computePlannedDuration(args.task.estimatedMinutes, factor.factor) +
    (args.task.extraMinutes ?? 0)
  // B.2 : le temps déjà passé est du temps de session MESURÉ, jamais déclaré.
  const measured = actualDuration(args.task.id, args.durationSource)

  return {
    taskId: args.task.id,
    userEstimate: args.task.estimatedMinutes,
    correctionFactor: factor.factor,
    plannedDuration: planned,
    measuredMinutes: measured,
    remainingMinutes: Math.max(0, planned - (measured ?? 0)),
    confidence: factor.confidence,
    reason: factor.reason,
  }
}
