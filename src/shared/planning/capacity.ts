import type {
  AncreItem,
  CognitiveWindow,
  DayCapacity,
  LearningObservation,
  ScheduleEntry,
  TimeSlot,
} from './types'

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
  /** Zone de réveil : les minutes qui suivent le lever, protégées par défaut. */
  wakeZone: 30,
  /** Sacrifice maximal de la zone de réveil, sur crise prouvée seulement (C.3). */
  wakeZoneMaxSacrifice: 20,
  /** Plancher absolu de la zone de réveil : jamais moins, quelle que soit la crise. */
  wakeZoneFloor: 10,
  /** A.2.3 : buffer fixe après un Trajet — jamais réduit, même en crise prouvée. */
  commuteBuffer: 5,
} as const

/**
 * A.2 / A.2.3 : la zone de réveil et le buffer de retour d'obligation (École,
 * Travail, Engagement, Autre) partagent le MÊME mécanisme — pas un système
 * séparé pour chacun. 30 minutes protégées par défaut. Réduction QUE sur
 * crise prouvée (densité > 1, C.2), d'au plus 20 minutes, jamais sous le
 * plancher de 10 — toujours chiffrée sur le jour concerné (C.3), jamais
 * silencieuse. Le Trajet n'utilise jamais cette fonction : son buffer de 5
 * minutes est fixe, sans aucun mécanisme de réduction (A.2.3).
 */
export function wakeZoneFor(isCrisis: boolean): number {
  if (!isCrisis) return FRAGMENT_DEFAULTS.wakeZone
  return Math.max(
    FRAGMENT_DEFAULTS.wakeZoneFloor,
    FRAGMENT_DEFAULTS.wakeZone - FRAGMENT_DEFAULTS.wakeZoneMaxSacrifice,
  )
}

/** Les heures de lever du jour : la fin de chaque plage de sommeil qui n'achève pas la journée. */
export function wakeMinutes(entries: ScheduleEntry[]): number[] {
  return entries
    .filter((e) => e.categoryType === 'sleep' && e.endMinute < 1440)
    .map((e) => e.endMinute)
}

/**
 * A.2.3 : fins d'obligations fixes RÉDUCTIBLES — École, Travail, Engagement,
 * Autre. Le sommeil a son propre mécanisme (A.2.2, la zone de réveil) et le
 * Trajet le sien (buffer fixe, jamais réduit) : ni l'un ni l'autre ne passe
 * par ce buffer-ci.
 */
export function reducibleObligationEndMinutes(entries: ScheduleEntry[]): number[] {
  return entries
    .filter((e) => e.categoryType !== 'sleep' && e.categoryType !== 'commute' && e.endMinute < 1440)
    .map((e) => e.endMinute)
}

/** A.2.3 : fins de Trajet — buffer fixe de 5 minutes, jamais réduit. */
export function commuteEndMinutes(entries: ScheduleEntry[]): number[] {
  return entries
    .filter((e) => e.categoryType === 'commute' && e.endMinute < 1440)
    .map((e) => e.endMinute)
}

/**
 * A.1 : les entrées d'un jour PRÉCIS — la seule bonne façon de croiser le
 * calendrier réel avec l'emploi du temps déclaré.
 *   - `date` renseigné sur l'entrée → occurrence unique, ne compte QUE pour
 *     cette date-là, jamais répétée la semaine suivante.
 *   - `date` absent → récurrente chaque semaine sur `dayOfWeek` (le
 *     comportement historique, toujours le défaut).
 */
export function scheduleEntriesForDate(
  entries: ScheduleEntry[],
  date: string,
  dayOfWeek: number,
): ScheduleEntry[] {
  return entries.filter((e) => (e.date ? e.date === date : e.dayOfWeek === dayOfWeek))
}

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
    ...ancres.map((a) => ({
      start: a.anchorMinute,
      end: Math.min(1440, a.anchorMinute + a.normalMaxMinutes),
    })),
  ]).reduce((sum, i) => sum + (i.end - i.start), 0)
  return Math.max(0, 1440 - occupied)
}

/** Les trous laissés par la réalité fixe et les ancres, dans l'ordre. */
export function buildFreeIntervals(entries: ScheduleEntry[], ancres: AncreItem[] = []): Interval[] {
  const busy = mergeIntervals([
    ...entries.map((e) => ({ start: e.startMinute, end: e.endMinute })),
    ...ancres.map((a) => ({
      start: a.anchorMinute,
      end: Math.min(1440, a.anchorMinute + a.normalMaxMinutes),
    })),
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
 * A.2 / A.2.3 : retire les marges protégées — 30 min avant le sommeil, 20 min
 * avant une obligation fixe, la zone de réveil juste après le lever, et le
 * buffer de retour après CHAQUE instance d'obligation fixe (École, Travail,
 * Engagement, Autre à 30/10 min selon la crise ; Trajet à 5 min fixes). Ce
 * temps existe, mais il n'est jamais planifiable.
 */
export function applyProtectedMargins(
  free: Interval[],
  entries: ScheduleEntry[],
  wakeZone: number = FRAGMENT_DEFAULTS.wakeZone,
  /** A.2.3 : même valeur crise-ajustée que `wakeZone` — même mécanisme, pas un système séparé. */
  postObligationBuffer: number = FRAGMENT_DEFAULTS.wakeZone,
): Interval[] {
  const protectedStarts = entries.map((e) => ({
    at: e.startMinute,
    margin:
      e.categoryType === 'sleep'
        ? FRAGMENT_DEFAULTS.preSleepTransition
        : FRAGMENT_DEFAULTS.preObligationPrep,
  }))
  const wakes = wakeMinutes(entries)
  // A.2.3 : buffer de retour, par instance, tous les jours où l'obligation a
  // lieu — jamais une fois par semaine. Réductible pour les quatre types
  // normaux, fixe pour le Trajet.
  const returns = [
    ...reducibleObligationEndMinutes(entries).map((at) => ({ at, margin: postObligationBuffer })),
    ...commuteEndMinutes(entries).map((at) => ({ at, margin: FRAGMENT_DEFAULTS.commuteBuffer })),
  ]

  return free
    .map((interval) => {
      let start = interval.start
      let end = interval.end
      for (const p of protectedStarts) {
        // La marge se prend juste avant l'obligation, donc à la fin du trou.
        if (p.at >= interval.start && p.at <= interval.end) end = Math.min(end, p.at - p.margin)
      }
      for (const at of wakes) {
        // La zone de réveil se prend juste après le lever, donc au début du trou.
        if (at >= interval.start && at <= interval.end) start = Math.max(start, at + wakeZone)
      }
      for (const p of returns) {
        // Le buffer de retour se prend juste après la fin de l'obligation.
        if (p.at >= interval.start && p.at <= interval.end) start = Math.max(start, p.at + p.margin)
      }
      return { start, end }
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

/**
 * D.7 : débit du retard non confirmé, dans un ordre STRICT et jamais au-delà
 * du jour même — le lendemain a ses propres obligations, il n'hérite jamais du
 * retard de la veille.
 *
 *   1. la réserve de repos du jour (E.2) l'absorbe EN PREMIER ;
 *   2. seul ce qui dépasse cette réserve réduit la capacité effective (A.3).
 *
 * Un retard entièrement absorbé par la réserve ne coûte donc aucune minute de
 * travail : c'est le rôle même de cette réserve d'encaisser l'imprévu. Les deux
 * parts sont rendues séparément pour rester chiffrées (C.3), jamais fondues en
 * un seul nombre qui cacherait ce que la journée a réellement payé.
 */
export function splitDelayDebit(
  delayMinutes: number,
  restReserveMinutes: number,
): { absorbedByRest: number; excess: number } {
  const delay = Math.max(0, delayMinutes)
  const reserve = Math.max(0, restReserveMinutes)
  const absorbedByRest = Math.min(delay, reserve)
  return { absorbedByRest, excess: delay - absorbedByRest }
}

/**
 * A.3 : capacité_effective = brute − inutilisables − repos − fatigue
 *                            − retard non confirmé excédentaire (D.7).
 * Plancher à 0 : une journée ne rend jamais une capacité négative.
 */
export function computeEffectiveCapacity(
  raw: number,
  unusable: number,
  restReserved: number,
  fatiguePenalty: number,
  delayExcess: number = 0,
): number {
  return Math.max(0, raw - unusable - restReserved - fatiguePenalty - delayExcess)
}

/** Assemble la capacité d'un jour. C'est `effectiveCapacityMinutes` — et lui seul — qui entre dans le test de faisabilité (A.3). */
export function buildDayCapacity(args: {
  date: string
  dayOfWeek: number
  entries: ScheduleEntry[]
  ancres: AncreItem[]
  restReservedMinutes: number
  fatiguePenaltyMinutes: number
  /** E.4/C.3 : minutes que le plancher de crise à 60 % a rendues sur la pénalité. */
  fatigueCrisisReliefMinutes?: number
  fragmentThreshold?: number
  /**
   * A.2/A.2.3 : zone de réveil ET buffer de retour d'obligation (École,
   * Travail, Engagement, Autre) du jour — même valeur, même mécanisme,
   * réduite uniquement sur crise prouvée. Le Trajet n'en dépend jamais : son
   * buffer de 5 min est fixe, câblé séparément.
   */
  wakeZoneMinutes?: number
  /**
   * D.7 : retard non confirmé mesuré ce jour-là. La réserve de repos l'absorbe
   * d'abord ; seul l'excédent touche la capacité effective.
   */
  delayMinutes?: number
  /**
   * Pour AUJOURD'HUI seulement (jamais un jour futur, jamais un jour écoulé
   * reconstruit pour E.3) : minute avant laquelle rien n'est offert au
   * placement. Le temps déjà passé ne peut plus accueillir un nouveau bloc —
   * exactement comme une obligation fixe déjà là — mais ça ne change NI le
   * budget (`effectiveCapacityMinutes` reste calculé sur la journée entière,
   * cohérent avec A.3) NI aucun autre chiffre : seuls les créneaux
   * physiquement proposés à l'allocateur se resserrent sur ce qu'il reste
   * vraiment. Bug réel observé le 2026-08-22 : sans ce paramètre, un recalcul
   * en fin de journée continuait de proposer des créneaux du matin, épuisait
   * le budget du jour dessus, et ne posait plus rien sur le vrai reste de la
   * soirée.
   */
  notBeforeMinute?: number
  windowAt?: (hour: number) => CognitiveWindow
}): DayCapacity {
  const threshold = args.fragmentThreshold ?? FRAGMENT_DEFAULTS.deepWork
  const wakeZone = args.wakeZoneMinutes ?? FRAGMENT_DEFAULTS.wakeZone
  const raw = computeRawCapacity(args.entries, args.ancres)
  const free = applyProtectedMargins(
    buildFreeIntervals(args.entries, args.ancres),
    args.entries,
    wakeZone,
    wakeZone,
  )

  // Le temps retiré par les marges protégées est indisponible au même titre
  // qu'un fragment trop court : les deux sortent de la capacité effective.
  // Ce calcul porte TOUJOURS sur la journée entière, même pour aujourd'hui —
  // c'est le budget (A.3), il ne rétrécit jamais parce que l'heure avance.
  const freeMinutes = free.reduce((s, i) => s + (i.end - i.start), 0)
  const { usable, unusableMinutes } = splitUsable(free, threshold)
  const unusable = unusableMinutes + Math.max(0, raw - freeMinutes)

  // Les créneaux réellement PLACEABLES, eux, excluent tout ce qui précède
  // `notBeforeMinute` — c'est la seule chose que ce paramètre change.
  const placeable =
    args.notBeforeMinute === undefined
      ? usable
      : usable
          .map((i) => ({ start: Math.max(i.start, args.notBeforeMinute!), end: i.end }))
          .filter((i) => i.end - i.start >= threshold)

  const slots: TimeSlot[] = placeable.map((i) => ({
    startMinute: i.start,
    endMinute: i.end,
    durationMinutes: i.end - i.start,
    cognitiveWindow: args.windowAt ? args.windowAt(Math.floor(i.start / 60)) : 'NORMALE',
  }))

  // C.3 : la zone de réveil et le buffer de retour d'obligation sont toujours
  // chiffrés — ce qui reste protégé et ce qu'une crise prouvée a coûté. Un
  // jour sans lever ou sans obligation déclarée n'en invente aucun.
  const wakeCount = wakeMinutes(args.entries).length
  const reducibleCount = reducibleObligationEndMinutes(args.entries).length
  const commuteCount = commuteEndMinutes(args.entries).length

  // D.7 : la réserve de repos encaisse le retard avant la capacité de travail.
  const delay = splitDelayDebit(args.delayMinutes ?? 0, args.restReservedMinutes)

  return {
    date: args.date,
    dayOfWeek: args.dayOfWeek,
    rawCapacityMinutes: raw,
    unusableMinutes: unusable,
    wakeZoneMinutes: wakeCount * wakeZone,
    wakeZoneSacrificedMinutes: wakeCount * (FRAGMENT_DEFAULTS.wakeZone - wakeZone),
    // A.2.3 : mêmes deux chiffres pour le buffer de retour réductible.
    postObligationBufferMinutes: reducibleCount * wakeZone,
    postObligationSacrificedMinutes: reducibleCount * (FRAGMENT_DEFAULTS.wakeZone - wakeZone),
    // A.2.3 : le Trajet est fixe — rien à sacrifier, juste ce qui est protégé.
    commuteBufferMinutes: commuteCount * FRAGMENT_DEFAULTS.commuteBuffer,
    restReservedMinutes: args.restReservedMinutes,
    fatiguePenaltyMinutes: args.fatiguePenaltyMinutes,
    fatigueCrisisReliefMinutes: args.fatigueCrisisReliefMinutes ?? 0,
    breathingReductionMinutes: 0,
    // D.7/C.3 : ce que le retard a coûté reste toujours en trois chiffres —
    // mesuré, absorbé, facturé. Jamais un seul total qui cacherait lequel.
    delayMinutes: Math.max(0, args.delayMinutes ?? 0),
    delayAbsorbedByRestMinutes: delay.absorbedByRest,
    delayExcessMinutes: delay.excess,
    effectiveCapacityMinutes: computeEffectiveCapacity(
      raw,
      unusable,
      args.restReservedMinutes,
      args.fatiguePenaltyMinutes,
      delay.excess,
    ),
    slots,
  }
}
