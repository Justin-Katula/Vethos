import type { AncreItem, CognitiveWindow, DayCapacity, LearningObservation, ScheduleEntry, TimeSlot } from './types'

// ═══ PARTIE A — TEMPS DISPONIBLE ═══════════════════════════════════════════

/** Seuils de départ (A.2). Personnalisés dès 5 observations (A.2.1). */
export const FRAGMENT_DEFAULTS = {
  /** Sous ce seuil, un fragment ne sert à rien pour du travail profond. */
  deepWork: 25,
  /** Idem pour du travail léger. */
  lightWork: 10,
  /** Transition avant le sommeil — protégée, jamais planifiée. */
  preSleepTransition: 30,
  /** Préparation avant une obligation fixe — protégée. */
  preObligationPrep: 20,
} as const

export type Interval = { start: number; end: number }

/** Fusionne des intervalles qui se chevauchent ou se touchent. */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].filter((i) => i.end > i.start).sort((a, b) => a.start - b.start)
  const merged: Interval[] = []
  for (const cur of sorted) {
    const last = merged[merged.length - 1]
    if (last && cur.start <= last.end) last.end = Math.max(last.end, cur.end)
    else merged.push({ ...cur })
  }
  return merged
}

/**
 * A.1 : capacité_brute = 1440 − sommeil − école/travail/obligations − trajets
 *       − ancres.
 * Le sommeil n'est jamais compté comme charge de travail : il sort de la
 * capacité, il n'y entre pas.
 */
export function computeRawCapacity(entries: ScheduleEntry[], ancres: AncreItem[] = []): number {
  const occupied = mergeIntervals([
    ...entries.map((e) => ({ start: e.startMinute, end: e.endMinute })),
    ...ancres.map((a) => ({ start: a.anchorMinute, end: Math.min(1440, a.anchorMinute + a.normalMaxMinutes) })),
  ]).reduce((sum, i) => sum + (i.end - i.start), 0)
  return Math.max(0, 1440 - occupied)
}

/** Les trous laissés par la réalité fixe et les ancres, dans l'ordre. */
export function buildFreeIntervals(entries: ScheduleEntry[], ancres: AncreItem[] = []): Interval[] {
  const busy = mergeIntervals([
    ...entries.map((e) => ({ start: e.startMinute, end: e.endMinute })),
    ...ancres.map((a) => ({ start: a.anchorMinute, end: Math.min(1440, a.anchorMinute + a.normalMaxMinutes) })),
  ])
  const free: Interval[] = []
  let cursor = 0
  for (const b of busy) {
    if (b.start > cursor) free.push({ start: cursor, end: b.start })
    cursor = Math.max(cursor, b.end)
  }
  if (cursor < 1440) free.push({ start: cursor, end: 1440 })
  return free
}

/**
 * A.2 : retire les marges protégées — 30 min avant le sommeil, 20 min avant
 * une obligation fixe. Ce temps existe, mais il n'est jamais planifiable.
 */
export function applyProtectedMargins(free: Interval[], entries: ScheduleEntry[]): Interval[] {
  const protectedStarts = entries.map((e) => ({
    at: e.startMinute,
    margin: e.categoryType === 'sleep' ? FRAGMENT_DEFAULTS.preSleepTransition : FRAGMENT_DEFAULTS.preObligationPrep,
  }))

  return free
    .map((interval) => {
      let end = interval.end
      for (const p of protectedStarts) {
        // La marge se prend juste avant l'obligation, donc à la fin du trou.
        if (p.at >= interval.start && p.at <= interval.end) end = Math.min(end, p.at - p.margin)
      }
      return { start: interval.start, end }
    })
    .filter((i) => i.end > i.start)
}

/**
 * A.2.1 : seuil de fragment personnalisé.
 * Avec ≥5 observations pour cette nature de travail, le plus petit bloc que
 * l'utilisateur a réellement mené à terme remplace le défaut ; en dessous, le
 * défaut tient et la confiance reste basse.
 */
export function measureFragmentThreshold(
  observations: LearningObservation[],
  workKind: 'routine' | 'novel',
): { threshold: number; confidence: 'low' | 'measured' } {
  const relevant = observations.filter(
    (o) => o.workKind === workKind && typeof o.actualMinutes === 'number' && o.completed === true,
  )
  if (relevant.length < 5) return { threshold: FRAGMENT_DEFAULTS.deepWork, confidence: 'low' }
  const shortest = Math.min(...relevant.map((o) => o.actualMinutes as number))
  return { threshold: Math.max(5, Math.floor(shortest / 5) * 5), confidence: 'measured' }
}

/** A.4/G.2 : reclasse une heure selon le taux de complétion réellement observé. */
export function classifyHour(
  hour: number,
  observationsByHour: Map<number, Array<{ completed: boolean }>>,
): CognitiveWindow {
  const obs = observationsByHour.get(hour) ?? []
  // G.3 : aucune conclusion sous 5 observations.
  if (obs.length < 5) return 'NORMALE'
  const rate = obs.filter((o) => o.completed).length / obs.length
  if (rate >= 0.75) return 'PROFONDE'
  if (rate >= 0.5) return 'NORMALE'
  return 'BASSE'
}

/** A.2 : ce qui est trop court pour servir. */
export function splitUsable(
  intervals: Interval[],
  threshold: number,
): { usable: Interval[]; unusableMinutes: number } {
  const usable: Interval[] = []
  let unusableMinutes = 0
  for (const i of intervals) {
    const dur = i.end - i.start
    if (dur >= threshold) usable.push(i)
    else unusableMinutes += dur
  }
  return { usable, unusableMinutes }
}

/** A.3 : capacité_effective = brute − inutilisables − repos − fatigue. */
export function computeEffectiveCapacity(
  raw: number,
  unusable: number,
  restReserved: number,
  fatiguePenalty: number,
): number {
  return Math.max(0, raw - unusable - restReserved - fatiguePenalty)
}

/** Assemble la capacité d'un jour. C'est `effectiveCapacityMinutes` — et lui seul — qui entre dans le test de faisabilité (A.3). */
export function buildDayCapacity(args: {
  date: string
  dayOfWeek: number
  entries: ScheduleEntry[]
  ancres: AncreItem[]
  restReservedMinutes: number
  fatiguePenaltyMinutes: number
  fragmentThreshold?: number
  windowAt?: (hour: number) => CognitiveWindow
}): DayCapacity {
  const threshold = args.fragmentThreshold ?? FRAGMENT_DEFAULTS.deepWork
  const raw = computeRawCapacity(args.entries, args.ancres)
  const free = applyProtectedMargins(buildFreeIntervals(args.entries, args.ancres), args.entries)

  // Le temps retiré par les marges protégées est indisponible au même titre
  // qu'un fragment trop court : les deux sortent de la capacité effective.
  const freeMinutes = free.reduce((s, i) => s + (i.end - i.start), 0)
  const { usable, unusableMinutes } = splitUsable(free, threshold)
  const unusable = unusableMinutes + Math.max(0, raw - freeMinutes)

  const slots: TimeSlot[] = usable.map((i) => ({
    startMinute: i.start,
    endMinute: i.end,
    durationMinutes: i.end - i.start,
    cognitiveWindow: args.windowAt ? args.windowAt(Math.floor(i.start / 60)) : 'NORMALE',
  }))

  return {
    date: args.date,
    dayOfWeek: args.dayOfWeek,
    rawCapacityMinutes: raw,
    unusableMinutes: unusable,
    restReservedMinutes: args.restReservedMinutes,
    fatiguePenaltyMinutes: args.fatiguePenaltyMinutes,
    breathingReductionMinutes: 0,
    effectiveCapacityMinutes: computeEffectiveCapacity(
      raw,
      unusable,
      args.restReservedMinutes,
      args.fatiguePenaltyMinutes,
    ),
    slots,
  }
}
