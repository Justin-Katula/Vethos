import type { LearningObservation } from '@shared/schemas'
import { reclassifyCognitiveWindow } from './capacity'
import type { CognitiveWindow } from './types'

/**
 * Partie G — Apprentissage.
 *
 * G.1 Mesurer (jamais ce qui est déclaré).
 * G.2 Utiliser (facteurs, fenêtres cognitives).
 * G.3 Prudence sur données faibles (<5 → pas de conclusion).
 */

// ─── G.1 Collecte ──────────────────────────────────────────────────────────

/**
 * Crée une observation à partir d'un événement réel.
 * G.1 : on mesure, on ne déclare jamais.
 */
export function createObservation(args: {
  taskId?: string
  category?: string
  estimatedMinutes?: number
  actualMinutes?: number
  startHour?: number
  completed?: boolean
}): LearningObservation {
  return {
    ...args,
    createdAt: new Date().toISOString(),
  }
}

// ─── G.2 Utiliser ──────────────────────────────────────────────────────────

/**
 * G.2 : regroupe les observations par heure pour reclasser les fenêtres cognitives.
 * Retourne une Map<hour, observations> pour alimentation de reclassifyCognitiveWindow.
 */
export function groupObservationsByHour(
  observations: LearningObservation[],
): Map<number, Array<{ completed: boolean }>> {
  const map = new Map<number, Array<{ completed: boolean }>>()
  for (const obs of observations) {
    if (obs.startHour === undefined) continue
    const existing = map.get(obs.startHour) ?? []
    existing.push({ completed: obs.completed ?? false })
    map.set(obs.startHour, existing)
  }
  return map
}

/**
 * G.2 : reclasser toutes les fenêtres cognitives à partir des observations.
 * Pour chaque heure 0-23, si ≥5 observations → reclasser. Sinon → NORMALE (G.3).
 */
export function reclassifyAllWindows(
  observations: LearningObservation[],
): Map<number, CognitiveWindow> {
  const byHour = groupObservationsByHour(observations)
  const result = new Map<number, CognitiveWindow>()
  for (let hour = 0; hour < 24; hour++) {
    result.set(hour, reclassifyCognitiveWindow(hour, byHour))
  }
  return result
}

/**
 * G.1/G.2 : filtrer les observations par catégorie pour le facteur de correction.
 */
export function observationsByCategory(
  observations: LearningObservation[],
  category: string,
): Array<{ estimatedMinutes: number; actualMinutes: number }> {
  return observations
    .filter((o) => o.category === category && o.estimatedMinutes !== undefined && o.actualMinutes !== undefined)
    .map((o) => ({ estimatedMinutes: o.estimatedMinutes!, actualMinutes: o.actualMinutes! }))
}

// ─── G.3 Prudence ──────────────────────────────────────────────────────────

/**
 * G.3 : aucune conclusion tirée de moins de 5 observations.
 * En dessous, afficher explicitement l'absence de données suffisantes.
 */
export function hasEnoughData(observationCount: number, threshold: number = 5): boolean {
  return observationCount >= threshold
}

export function dataConfidenceLevel(observationCount: number): 'none' | 'low' | 'medium' | 'high' {
  if (observationCount === 0) return 'none'
  if (observationCount < 5) return 'low'
  if (observationCount < 10) return 'medium'
  return 'high'
}
