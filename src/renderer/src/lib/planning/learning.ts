import type { CognitiveWindow } from './types'
import { reclassifyCognitiveWindow } from './capacity'

// ═══ PARTIE G — APPRENTISSAGE ═════════════════════════════════════════════

export type Observation = {
  taskId?: string
  category?: string
  estimatedMinutes?: number
  actualMinutes?: number
  startHour?: number
  completed?: boolean
  createdAt: string
}

/** G.1 : créer une observation (mesure, jamais déclaration). */
export function createObservation(args: Omit<Observation, 'createdAt'>): Observation {
  return { ...args, createdAt: new Date().toISOString() }
}

/** G.2 : regrouper par heure. */
export function groupByHour(obs: Observation[]): Map<number, Array<{ completed: boolean }>> {
  const map = new Map<number, Array<{ completed: boolean }>>()
  for (const o of obs) {
    if (o.startHour === undefined) continue
    const arr = map.get(o.startHour) ?? []
    arr.push({ completed: o.completed ?? false })
    map.set(o.startHour, arr)
  }
  return map
}

/** G.2 : reclasser toutes les fenêtres cognitives. */
export function reclassifyAll(obs: Observation[]): Map<number, CognitiveWindow> {
  const byHour = groupByHour(obs)
  const result = new Map<number, CognitiveWindow>()
  for (let h = 0; h < 24; h++) result.set(h, reclassifyCognitiveWindow(h, byHour))
  return result
}

/** G.2 : filtrer observations par catégorie. */
export function byCategory(obs: Observation[], cat: string): Array<{ estimatedMinutes: number; actualMinutes: number }> {
  return obs
    .filter((o) => o.category === cat && o.estimatedMinutes !== undefined && o.actualMinutes !== undefined)
    .map((o) => ({ estimatedMinutes: o.estimatedMinutes!, actualMinutes: o.actualMinutes! }))
}

/** G.3 : prudence sur données faibles. */
export function hasEnoughData(n: number, threshold = 5): boolean { return n >= threshold }
export function dataConfidence(n: number): 'none' | 'low' | 'medium' | 'high' {
  if (n === 0) return 'none'
  if (n < 5) return 'low'
  if (n < 10) return 'medium'
  return 'high'
}
