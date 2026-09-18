import type { CognitiveWindow, LearningObservation } from './types'
import { classifyHour } from './capacity'

// ═══ PARTIE G — APPRENTISSAGE ═════════════════════════════════════════════
//
// G.1 : on mesure. On ne prend jamais une déclaration pour une mesure.
// G.3 : aucune conclusion sous 5 observations — l'absence de données se dit,
//       elle ne s'invente pas en tendance.

export const MIN_OBSERVATIONS = 5
export const HIGH_CONFIDENCE_OBSERVATIONS = 10

export type Confidence = 'none' | 'low' | 'medium' | 'high'

export function dataConfidence(sampleSize: number): Confidence {
  if (sampleSize === 0) return 'none'
  if (sampleSize < MIN_OBSERVATIONS) return 'low'
  if (sampleSize < HIGH_CONFIDENCE_OBSERVATIONS) return 'medium'
  return 'high'
}

export function hasEnoughData(sampleSize: number): boolean {
  return sampleSize >= MIN_OBSERVATIONS
}

/** Crée une observation. L'horodatage est injecté — le moteur reste déterministe. */
export function createObservation(
  fields: Omit<LearningObservation, 'createdAt'>,
  now: Date,
): LearningObservation {
  return { ...fields, createdAt: now.toISOString() }
}

/** G.1 : taux de complétion des blocs, par heure de la journée. */
export function groupByHour(
  observations: LearningObservation[],
): Map<number, Array<{ completed: boolean }>> {
  const map = new Map<number, Array<{ completed: boolean }>>()
  for (const o of observations) {
    if (o.startHour === undefined || o.completed === undefined) continue
    const arr = map.get(o.startHour) ?? []
    arr.push({ completed: o.completed })
    map.set(o.startHour, arr)
  }
  return map
}

/**
 * G.2 : reclasse les 24 fenêtres cognitives selon le taux de complétion
 * réellement observé par heure — jamais selon une théorie générale.
 * Un créneau en échec systématique cesse d'être proposé pour du travail
 * exigeant : il tombe en BASSE et la préférence PROFONDE l'évite.
 */
export function buildWindowMap(observations: LearningObservation[]): Map<number, CognitiveWindow> {
  const byHour = groupByHour(observations)
  const map = new Map<number, CognitiveWindow>()
  for (let h = 0; h < 24; h++) map.set(h, classifyHour(h, byHour))
  return map
}

/** Accès direct à la fenêtre d'une heure, défaut NORMALE. */
export function windowLookup(map: Map<number, CognitiveWindow>): (hour: number) => CognitiveWindow {
  return (hour: number) => map.get(hour) ?? 'NORMALE'
}

/** G.1 : taux de tenue des ancres, par heure d'ancrage. */
export function anchorHoldRate(
  observations: Array<{ anchorHour: number; held: boolean }>,
  hour: number,
): { rate: number; confidence: Confidence } {
  const at = observations.filter((o) => o.anchorHour === hour)
  if (at.length === 0) return { rate: 0, confidence: 'none' }
  return {
    rate: at.filter((o) => o.held).length / at.length,
    confidence: dataConfidence(at.length),
  }
}

/** G.1 : taux de report des objectifs. */
export function objectivePostponementRate(
  observations: Array<{ objectiveId: string; postponed: boolean }>,
  objectiveId: string,
): { rate: number; confidence: Confidence } {
  const of = observations.filter((o) => o.objectiveId === objectiveId)
  if (of.length === 0) return { rate: 0, confidence: 'none' }
  return {
    rate: of.filter((o) => o.postponed).length / of.length,
    confidence: dataConfidence(of.length),
  }
}
