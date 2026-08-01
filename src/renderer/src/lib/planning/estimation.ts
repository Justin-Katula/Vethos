import type { DurationRealSource } from './types'
import { STUB_DURATION_SOURCE } from './types'

// ═══ PARTIE B — ESTIMATION DE DURÉE (TÂCHES UNIQUEMENT) ═══════════════════

export const DEFAULT_FACTORS = { routine: 1.4, novel: 1.7 } as const

/** B.1 : facteur de correction = médiane(réelle/estimée) par catégorie. */
export function computeCorrectionFactor(args: {
  observations: Array<{ estimatedMinutes: number; actualMinutes: number }>
  defaultFactor?: number
}): { factor: number; confidence: 'low' | 'medium' | 'high' } {
  const n = args.observations.length
  if (n < 5) return { factor: args.defaultFactor ?? DEFAULT_FACTORS.routine, confidence: 'low' }

  const ratios = args.observations
    .filter((o) => o.estimatedMinutes > 0)
    .map((o) => o.actualMinutes / o.estimatedMinutes)
    .sort((a, b) => a - b)
  if (ratios.length === 0) return { factor: args.defaultFactor ?? DEFAULT_FACTORS.routine, confidence: 'low' }

  const mid = Math.floor(ratios.length / 2)
  const median = ratios.length % 2 === 0 ? (ratios[mid - 1]! + ratios[mid]!) / 2 : ratios[mid]!
  return { factor: Math.max(0.5, Math.min(3, median)), confidence: n >= 10 ? 'high' : 'medium' }
}

/** B.3 : durée_de_départ = (O + 4×M + P) / 6. */
export function pertEstimate(O: number, M: number, P: number): number {
  return Math.round((O + 4 * M + P) / 6)
}

/** B.4 : 75e percentile pour tâches, médiane pour objectifs. */
export function planificationPercentile(args: {
  observations: Array<{ estimatedMinutes: number; actualMinutes: number }>
  percentile: number
  defaultFactor?: number
}): number {
  if (args.observations.length < 5) return args.defaultFactor ?? DEFAULT_FACTORS.routine
  const ratios = args.observations
    .filter((o) => o.estimatedMinutes > 0)
    .map((o) => o.actualMinutes / o.estimatedMinutes)
    .sort((a, b) => a - b)
  if (ratios.length === 0) return args.defaultFactor ?? DEFAULT_FACTORS.routine
  const idx = args.percentile * (ratios.length - 1)
  const lo = Math.floor(idx), hi = Math.ceil(idx), frac = idx - lo
  const val = ratios[lo]! + frac * (ratios[hi]! - ratios[lo]!)
  return Math.max(0.5, Math.min(3, val))
}

/** B.1 : durée_planifiée = estimation × facteur. */
export function computePlannedDuration(userEstimate: number, factor: number): number {
  return Math.max(1, Math.round(userEstimate * factor))
}

/** B.5 : découpage mécanique en blocs de 90 min max, min 25 min. */
export function autoSplit(total: number, maxBlock = 90, minBlock = 25): number[] {
  if (total <= maxBlock) return [total]
  const blocks: number[] = []
  let rem = total
  while (rem > 0) {
    if (rem <= maxBlock && rem >= minBlock) { blocks.push(rem); break }
    if (rem < minBlock) { blocks[blocks.length - 1]! += rem; break }
    blocks.push(maxBlock); rem -= maxBlock
  }
  return blocks
}

/** B : assemble l'estimation complète d'une tâche. */
export function estimateTask(args: {
  taskId: string
  userEstimate: number
  hasDeadline: boolean
  observations: Array<{ estimatedMinutes: number; actualMinutes: number }>
  durationSource?: DurationRealSource
}): { taskId: string; userEstimate: number; correctionFactor: number; plannedDuration: number; confidence: 'low' | 'medium' | 'high' } {
  const source = args.durationSource ?? STUB_DURATION_SOURCE
  const actual = source.getActualMinutes(args.taskId)
  const obs = actual != null ? [...args.observations, { estimatedMinutes: args.userEstimate, actualMinutes: actual }] : args.observations
  const { factor, confidence } = computeCorrectionFactor({ observations: obs })
  const effectiveFactor = args.hasDeadline
    ? planificationPercentile({ observations: obs, percentile: 0.75, defaultFactor: factor })
    : factor
  return {
    taskId: args.taskId,
    userEstimate: args.userEstimate,
    correctionFactor: effectiveFactor,
    plannedDuration: computePlannedDuration(args.userEstimate, effectiveFactor),
    confidence,
  }
}
