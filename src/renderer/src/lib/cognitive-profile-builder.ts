import type { UserBehaviorEvent, UserCognitiveModel } from '@shared/user-model'

type CognitiveSignal = { status?: string; startedAt?: string; endedAt?: string; completedAt?: string; hour?: number; plannedMinutes?: number; actualMinutes?: number; efficiency?: number; complexity?: string }
type CognitiveSession = CognitiveSignal
type CompletionSample = CognitiveSignal
type CognitiveSettings = { chronotype?: string; declaredChronotype?: string; sleepStart?: string }

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(Number.isFinite(n) ? n : 0)))
const complexity = (value?: string) => value === 'extreme' ? 1.2 : value === 'hard' ? 1.1 : value === 'easy' ? 0.85 : 1
function score(item: CognitiveSession | CompletionSample): number {
  if (typeof item.efficiency === 'number') return clamp(item.efficiency)
  const planned = Math.max(1, item.plannedMinutes ?? 30)
  const actual = Math.max(1, item.actualMinutes ?? planned)
  return clamp((planned / actual) * 70 * complexity(item.complexity))
}

export function buildCognitiveModel(
  sessions: readonly CognitiveSession[] = [],
  taskCompletions: readonly CompletionSample[] = [],
  settings: CognitiveSettings = {},
  events: readonly UserBehaviorEvent[] = [],
  now = new Date().toISOString(),
): UserCognitiveModel {
  const buckets = Array.from({ length: 24 }, (_, hour) => ({ hour, scores: [] as number[], aborted: 0 }))
  for (const item of [...sessions, ...taskCompletions]) {
    const date = item.startedAt ?? item.completedAt
    const hour = item.hour ?? (date ? new Date(date).getHours() : -1)
    if (hour < 0 || hour > 23) continue
    buckets[hour]!.scores.push(item.status === 'aborted' ? Math.min(35, score(item)) : score(item))
    if (item.status === 'aborted') buckets[hour]!.aborted++
  }
  const hourlyPerformance = buckets.map((bucket) => ({
    hour: bucket.hour,
    averageEfficiency: bucket.scores.length ? clamp(bucket.scores.reduce((a, b) => a + b, 0) / bucket.scores.length) : 0,
    sampleCount: bucket.scores.length,
    confidence: clamp(Math.min(90, bucket.scores.length * 18)),
  }))
  const strong = hourlyPerformance.filter((hour) => hour.sampleCount >= 2 && hour.averageEfficiency >= 65)
  const bestDeepWorkWindows = strong.map((hour) => ({ startHour: hour.hour, endHour: (hour.hour + 1) % 24, confidence: hour.confidence }))
  const unlocks = events.filter((event) => event.type === 'unlock_requested')
  const fatigueRiskByHour = buckets.map((bucket) => {
    const perf = hourlyPerformance[bucket.hour]!
    const unlockCount = unlocks.filter((event) => new Date(event.createdAt).getHours() === bucket.hour).length
    return { hour: bucket.hour, risk: clamp((perf.sampleCount ? 100 - perf.averageEfficiency : 20) + bucket.aborted * 18 + unlockCount * 8) }
  })
  const morning = hourlyPerformance.filter((hour) => hour.hour >= 5 && hour.hour < 12 && hour.sampleCount).reduce((n, h) => n + h.averageEfficiency * h.sampleCount, 0)
  const evening = hourlyPerformance.filter((hour) => hour.hour >= 17 && hour.hour < 24 && hour.sampleCount).reduce((n, h) => n + h.averageEfficiency * h.sampleCount, 0)
  const samples = hourlyPerformance.reduce((sum, hour) => sum + hour.sampleCount, 0)
  const detectedChronotype = samples < 3 ? 'unknown' : morning > evening * 1.15 ? 'morning' : evening > morning * 1.15 ? 'evening' : 'intermediate'
  const declared = settings.declaredChronotype ?? settings.chronotype
  const declaredChronotype = declared === 'morning' || declared === 'evening' || declared === 'intermediate' ? declared : 'unknown'
  return { declaredChronotype, detectedChronotype, hourlyPerformance, bestDeepWorkWindows, fatigueRiskByHour, updatedAt: now }
}
