import type { AncreItem, ScheduleEntry } from './types'
import { computeDensities, type DayCapacityPoint } from './feasibility'
import { buildFreeIntervals } from './capacity'

// ═══ PARTIE E.5 — SYSTÈME DE DEMANDE ═════════════════════════════════════
//
// Ce n'est pas un interrupteur on/off. C'est l'utilisateur qui vient demander
// quelque chose à l'application (F) — jamais l'inverse.

export type UserRequest = {
  type: 'rest' | 'free_time'
  minutes: number
  date: string
  /** Plage précise souhaitée, si l'utilisateur en a une en tête. */
  startMinute?: number
}

export type RequestVerdict = {
  status: 'granted' | 'partial' | 'denied'
  grantedMinutes: number
  reason: string
  deficitMinutes?: number
  /** La plus grande version de la demande qui reste dans les limites sûres. */
  safeVersion?: UserRequest
  /** Alternative la plus proche quand une règle absolue est touchée. */
  alternative?: UserRequest
}

/** Une règle absolue est touchée : le sommeil et les ancres ne se négocient pas. */
export function touchesAbsoluteRule(args: {
  request: UserRequest
  daySchedule: ScheduleEntry[]
  dayAncres: AncreItem[]
}): boolean {
  if (args.request.startMinute === undefined) return false
  const start = args.request.startMinute
  const end = start + args.request.minutes
  const sleeps = args.daySchedule.filter((e) => e.categoryType === 'sleep')
  const hitsSleep = sleeps.some((e) => start < e.endMinute && e.startMinute < end)
  const hitsAncre = args.dayAncres.some((a) => start < a.anchorMinute + a.normalMaxMinutes && a.anchorMinute < end)
  return hitsSleep || hitsAncre
}

/** L'alternative la plus proche qui respecte la règle absolue. */
function nearestFreeWindow(args: {
  request: UserRequest
  daySchedule: ScheduleEntry[]
  dayAncres: AncreItem[]
}): UserRequest | undefined {
  const wanted = args.request.startMinute ?? 0
  const candidates = buildFreeIntervals(args.daySchedule, args.dayAncres)
    .filter((i) => i.end - i.start >= args.request.minutes)
    .map((i) => {
      // Au plus près de l'heure souhaitée, sans jamais sortir du trou libre.
      const start = Math.min(Math.max(wanted, i.start), i.end - args.request.minutes)
      return { start, distance: Math.abs(start - wanted) }
    })
    .sort((a, b) => a.distance - b.distance)

  const best = candidates[0]
  return best ? { ...args.request, startMinute: best.start } : undefined
}

/** Densité maximale de la semaine si la demande était accordée. */
function maxDensityIfGranted(args: {
  minutes: number
  date: string
  tasks: Array<{ deadline: string; remainingMinutes: number }>
  dailyCapacity: DayCapacityPoint[]
  today: string
}): { maxDensity: number; deficitMinutes: number } {
  const adjusted = args.dailyCapacity.map((c) =>
    c.date === args.date ? { ...c, capacityMinutes: Math.max(0, c.capacityMinutes - args.minutes) } : c,
  )
  const densities = computeDensities({ tasks: args.tasks, dailyCapacity: adjusted, today: args.today })
  const worst = densities.reduce<{ maxDensity: number; deficitMinutes: number }>(
    (acc, d) =>
      d.density > acc.maxDensity
        ? { maxDensity: d.density, deficitMinutes: Math.max(0, Math.round(d.loadMinutes - d.capacityMinutes)) }
        : acc,
    { maxDensity: 0, deficitMinutes: 0 },
  )
  return worst
}

/**
 * E.5 : évaluer une demande.
 *   1. Règle absolue touchée → jamais accordée telle quelle ; on propose
 *      l'alternative la plus proche qui la respecte.
 *   2. Sinon, recalcul de toute la semaine comme si elle était accordée.
 *   3. Densité ≤ 1 partout → accordée directement, sans contrepartie.
 *   4. Densité dépasserait 1 → JAMAIS accordée telle quelle, et JAMAIS
 *      présentée comme un échange contre la marge d'une tâche. On produit le
 *      déficit chiffré et la plus grande version sûre de la demande.
 *
 * RÈGLE ABSOLUE : cette évaluation ne peut jamais proposer d'échanger de la
 * marge de sécurité prouvée contre du confort personnel, même chiffré
 * honnêtement.
 */
export function evaluateRequest(args: {
  request: UserRequest
  tasks: Array<{ deadline: string; remainingMinutes: number }>
  dailyCapacity: DayCapacityPoint[]
  today: string
  daySchedule?: ScheduleEntry[]
  dayAncres?: AncreItem[]
}): RequestVerdict {
  const daySchedule = args.daySchedule ?? []
  const dayAncres = args.dayAncres ?? []

  if (touchesAbsoluteRule({ request: args.request, daySchedule, dayAncres })) {
    return {
      status: 'denied',
      grantedMinutes: 0,
      reason: 'Cette plage touche le sommeil ou une ancre — deux règles absolues. Voici la plage libre la plus proche.',
      alternative: nearestFreeWindow({ request: args.request, daySchedule, dayAncres }),
    }
  }

  const full = maxDensityIfGranted({ ...args, minutes: args.request.minutes, date: args.request.date })
  if (full.maxDensity <= 1) {
    return { status: 'granted', grantedMinutes: args.request.minutes, reason: 'Accordée — la faisabilité reste prouvée.' }
  }

  // La plus grande version sûre, par dichotomie sur les minutes demandées.
  let low = 0
  let high = args.request.minutes
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    const probe = maxDensityIfGranted({ ...args, minutes: mid, date: args.request.date })
    if (probe.maxDensity <= 1) low = mid
    else high = mid - 1
  }

  return {
    status: low > 0 ? 'partial' : 'denied',
    grantedMinutes: low,
    reason:
      low > 0
        ? `La demande complète ferait passer la densité au-dessus de 1 (déficit ${full.deficitMinutes} min). ${low} min tiennent sans entamer aucune marge.`
        : `Aucune minute libre sans entamer une marge de sécurité prouvée (déficit ${full.deficitMinutes} min). La marge ne s'échange pas contre du confort.`,
    deficitMinutes: full.deficitMinutes,
    safeVersion: low > 0 ? { ...args.request, minutes: low } : undefined,
  }
}
