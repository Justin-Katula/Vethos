import type { AncreItem, CognitiveWindow, ObjectiveItem, TaskItem, TimeSlot } from './types'
import type { Margin } from './feasibility'

// ═══ PARTIE D — ORDRE DE PLACEMENT ═══════════════════════════════════════

export const TASK_CONSTANTS = {
  /** D.5 : plafond de sécurité par tâche et par jour — sauf crise prouvée. */
  maxPercentPerDay: 0.4,
  /** D.5 : la cible réelle, ce n'est pas le plafond de 40 %. */
  targetBlockMinutes: 90,
  /** D.5 : sous 25 minutes, un bloc ne sert à rien. */
  minBlockMinutes: 25,
  /** D.5 : maximum 2 blocs de travail profond (90 min) par jour. */
  maxDeepBlocksPerDay: 2,
} as const

export type TaskWithMargin = TaskItem & Margin

/**
 * D.6 : cascade complète, ordre définitif —
 *   1. DEADLINE (EDF) : une tâche en crise de deadline passe toujours en
 *      premier, jamais sacrifiée pour l'importance ni pour SRPT.
 *   2. IMPORTANCE déclarée (C.1.1) parmi les deadlines équivalentes.
 *   3. SRPT : le moins de travail restant d'abord, forcé avant de commencer
 *      quelque chose de moins avancé.
 *   4. Ordre de création, la plus ancienne d'abord. Jamais aléatoire.
 *
 * La marge n'ordonne jamais directement (D.5) : elle n'autorise qu'un
 * dépassement du plafond de 40 % en cas de crise prouvée.
 */
export function sortTasksByCascade(tasks: TaskWithMargin[]): TaskWithMargin[] {
  return [...tasks].sort((a, b) => {
    if (a.deadline !== b.deadline) return a.deadline.localeCompare(b.deadline)
    if (a.importance !== b.importance) return b.importance - a.importance
    if (a.remainingMinutes !== b.remainingMinutes) return a.remainingMinutes - b.remainingMinutes
    return a.createdAt.localeCompare(b.createdAt)
  })
}

// ─── D.3 — Ancres ─────────────────────────────────────────────────────────

/** D.3 : minimum_ancre = MAX(20 minutes, 40 % × durée_normale_max). */
export function computeAncreMinimum(normalMaxMinutes: number): number {
  return Math.max(20, Math.round(normalMaxMinutes * 0.4))
}

/**
 * D.3 : deux ancres ne peuvent jamais occuper le même créneau, et il n'y a
 * qu'une ancre par déclencheur. La création de la seconde est REFUSÉE — pas de
 * fusion, pas de décalage automatique.
 */
export function findAncreConflict(
  candidate: Pick<AncreItem, 'anchorMinute' | 'normalMaxMinutes' | 'daysOfWeek' | 'trigger'>,
  existing: AncreItem[],
): AncreItem | null {
  const candEnd = candidate.anchorMinute + candidate.normalMaxMinutes
  for (const a of existing) {
    if (a.trigger.trim().toLowerCase() === candidate.trigger.trim().toLowerCase()) return a
    const sharesDay = a.daysOfWeek.some((d) => candidate.daysOfWeek.includes(d))
    if (!sharesDay) continue
    const overlaps =
      candidate.anchorMinute < a.anchorMinute + a.normalMaxMinutes && a.anchorMinute < candEnd
    if (overlaps) return a
  }
  return null
}

// ─── D.4 — Objectifs ──────────────────────────────────────────────────────

/**
 * D.4 : quota_quotidien = cible hebdomadaire restante répartie sur les jours
 * disponibles, pondérée par la capacité effective de chaque jour — jamais un
 * partage égal.
 *   - Report plafonné à 2 jours : au-delà, plus rien ne s'accumule.
 *   - Objectif jamais servi 3 jours de suite : l'application réajuste
 *     elle-même la répartition, sans poser de question.
 */
export function computeObjectiveQuota(args: {
  objective: ObjectiveItem
  servedThisWeekMinutes: number
  todayCapacityMinutes: number
  remainingWeekCapacityMinutes: number
  daysSinceLastService: number
}): number {
  const remainingTarget = Math.max(
    0,
    args.objective.weeklyTargetMinutes - args.servedThisWeekMinutes,
  )
  if (
    remainingTarget <= 0 ||
    args.remainingWeekCapacityMinutes <= 0 ||
    args.todayCapacityMinutes <= 0
  )
    return 0

  const evenDaily = args.objective.weeklyTargetMinutes / 7
  const weighted = remainingTarget * (args.todayCapacityMinutes / args.remainingWeekCapacityMinutes)

  // Report : la journée du jour plus deux jours reportés au maximum.
  const carryCap = evenDaily * 3
  let quota = Math.min(weighted, carryCap)

  // Réajustement automatique après 3 jours sans service.
  if (args.daysSinceLastService >= 3) quota = Math.max(quota, evenDaily)

  return Math.round(Math.min(quota, remainingTarget))
}

// ─── D.5 — Tâches ─────────────────────────────────────────────────────────

/** D.5 : bloc_cible = min(besoin_restant, 90 minutes, plafond 40 % du jour). */
export function computeTargetBlockSize(remainingNeed: number, dayCapacity: number): number {
  return Math.min(
    remainingNeed,
    TASK_CONSTANTS.targetBlockMinutes,
    Math.floor(dayCapacity * TASK_CONSTANTS.maxPercentPerDay),
  )
}

/**
 * D.5 : sous pression réelle, répartition proportionnelle sur TOUS les jours
 * restants — jamais tout sur un seul jour.
 *   part_jour = (capacité_du_jour / Σ capacités restantes) × besoin_total
 */
export function computeProportionalShare(
  dayCapacity: number,
  totalRemainingCapacity: number,
  totalWork: number,
): number {
  if (totalRemainingCapacity <= 0) return 0
  return Math.round((dayCapacity / totalRemainingCapacity) * totalWork)
}

/**
 * D.5 : la cible du jour pour une tâche.
 * L'idéal (un bloc de 90 min, plafonné à 40 % du jour) tient tant qu'il suffit
 * avant la deadline. Sinon, pression prouvée → répartition proportionnelle,
 * et si même elle dépasse le plafond, la crise autorise le dépassement.
 */
export function computeTaskDayTarget(args: {
  remainingNeed: number
  dayCapacity: number
  remainingDayCapacities: number[]
  /** Marge négative = crise prouvée : le plafond de 40 % saute. */
  isCrisis: boolean
}): { target: number; capOverride: boolean } {
  const cap40 = Math.floor(args.dayCapacity * TASK_CONSTANTS.maxPercentPerDay)
  const idealTotal = args.remainingDayCapacities.reduce(
    (s, c) =>
      s +
      Math.min(TASK_CONSTANTS.targetBlockMinutes, Math.floor(c * TASK_CONSTANTS.maxPercentPerDay)),
    0,
  )

  // L'idéal suffit : un bloc cible, plafond respecté.
  if (idealTotal >= args.remainingNeed) {
    return {
      target: Math.min(
        computeTargetBlockSize(args.remainingNeed, args.dayCapacity),
        args.dayCapacity,
      ),
      capOverride: false,
    }
  }

  // Pression réelle : part proportionnelle du besoin total.
  const totalCapacity = args.remainingDayCapacities.reduce((s, c) => s + c, 0)
  const share = computeProportionalShare(args.dayCapacity, totalCapacity, args.remainingNeed)

  if (share <= cap40) return { target: Math.min(share, args.dayCapacity), capOverride: false }
  // Même la répartition dépasse 40 % : crise prouvée → dépassement autorisé.
  if (args.isCrisis) return { target: Math.min(share, args.dayCapacity), capOverride: true }
  return { target: Math.min(cap40, args.dayCapacity), capOverride: false }
}

// ─── D.6 — Limite de travail en cours ─────────────────────────────────────

/** Défaut tant que λ n'est pas mesuré (moins de 2 semaines de données). */
export const WIP_COLD_START = 4

/**
 * D.6 : L = λ × W. λ = tâches créées par semaine (mesuré), W = semaines cibles
 * pour finir une tâche typique. Au-delà, simple encouragement à terminer —
 * jamais un blocage dur.
 */
export function computeWIPLimit(args: {
  tasksCreatedPerWeek: Record<string, number>
  targetWeeks: number
}): number {
  const weeks = Object.values(args.tasksCreatedPerWeek)
  if (weeks.length < 2) return WIP_COLD_START
  const lambda = weeks.reduce((s, n) => s + n, 0) / weeks.length
  return Math.max(1, Math.round(lambda * args.targetWeeks))
}

// ─── Allocation réelle des créneaux ───────────────────────────────────────
//
// Un seul allocateur par jour : deux blocs ne peuvent pas occuper la même
// minute. C'est la seule façon d'écrire un planning qu'on peut suivre.

export type Allocation = {
  startMinute: number
  endMinute: number
  cognitiveWindow: CognitiveWindow
}

export class DayAllocator {
  private free: Array<{ start: number; end: number }>
  private readonly windowAt: (hour: number) => CognitiveWindow

  constructor(slots: TimeSlot[], windowAt?: (hour: number) => CognitiveWindow) {
    this.free = slots
      .map((s) => ({ start: s.startMinute, end: s.endMinute }))
      .sort((a, b) => a.start - b.start)
    this.windowAt = windowAt ?? (() => 'NORMALE')
  }

  /** Minutes libres restantes, tous créneaux confondus. */
  totalFree(): number {
    return this.free.reduce((s, i) => s + (i.end - i.start), 0)
  }

  /** Le plus grand bloc contigu encore disponible. */
  largestFree(): number {
    return this.free.reduce((max, i) => Math.max(max, i.end - i.start), 0)
  }

  /** Retire une plage précise (ancre à heure fixe). */
  reserve(start: number, end: number): void {
    const next: Array<{ start: number; end: number }> = []
    for (const i of this.free) {
      if (end <= i.start || start >= i.end) {
        next.push(i)
        continue
      }
      if (i.start < start) next.push({ start: i.start, end: start })
      if (end < i.end) next.push({ start: end, end: i.end })
    }
    this.free = next
  }

  /**
   * Prend `minutes` consécutives. `preferWindow` fait chercher d'abord une
   * fenêtre cognitive de cette qualité (D.1.4 : objectifs en fenêtres
   * PROFONDES), sans jamais empêcher le placement si elle n'existe pas.
   */
  take(minutes: number, preferWindow?: CognitiveWindow): Allocation | null {
    if (minutes <= 0) return null
    const fits = this.free.filter((i) => i.end - i.start >= minutes)
    if (fits.length === 0) return null

    const preferred = preferWindow
      ? fits.find((i) => this.windowAt(Math.floor(i.start / 60)) === preferWindow)
      : undefined
    const chosen = preferred ?? fits[0]!

    const allocation: Allocation = {
      startMinute: chosen.start,
      endMinute: chosen.start + minutes,
      cognitiveWindow: this.windowAt(Math.floor(chosen.start / 60)),
    }
    this.reserve(allocation.startMinute, allocation.endMinute)
    return allocation
  }
}
