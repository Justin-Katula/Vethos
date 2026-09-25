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
 *
 * B.5.1 : entre sœurs d'un même découpage, le RANG passe avant tout le reste.
 * Sans lui, les quatre clés ci-dessus sont rigoureusement identiques pour
 * toutes les parties — `createdAt` compris, calculé une seule fois pour tout
 * le lot — le comparateur renvoie 0 partout, et l'ordre final est celui,
 * arbitraire, que produit le tri de la plateforme. Défaut réel observé le
 * 2026-08-23 : les parties d'une même tâche apparaissaient dans l'ordre
 * 1, 4, 2, 5, 3 sur le calendrier.
 */
export function sortTasksByCascade(tasks: TaskWithMargin[]): TaskWithMargin[] {
  return [...tasks].sort((a, b) => {
    const siblings =
      a.parentTaskId !== null &&
      a.parentTaskId === b.parentTaskId &&
      a.partOrder !== null &&
      b.partOrder !== null
    if (siblings && a.partOrder !== b.partOrder) return a.partOrder! - b.partOrder!
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

/** D.4 : la semaine est calendaire, lundi → dimanche. Toujours sept jours. */
export const DAYS_PER_WEEK = 7

/** D.4 : rythme_quotidien_cible = cible_hebdomadaire ÷ 7. Fixe, toujours. */
export function dailyRhythm(weeklyTargetMinutes: number): number {
  return weeklyTargetMinutes / DAYS_PER_WEEK
}

/**
 * D.4 : quota_quotidien = rythme quotidien fixe (cible ÷ 7), ajusté par la
 * capacité effective du jour comparée à la moyenne de sa semaine.
 *
 * Le diviseur ne bouge JAMAIS avec les jours qui restent : une semaine
 * commencée un jeudi donne un total naturellement plus bas cette semaine-là,
 * jamais un rattrapage écrasé sur les derniers jours — et la cadence normale
 * revient d'elle-même dès le lundi suivant.
 *   - Report plafonné à 2 jours : au-delà, plus rien ne s'accumule.
 *   - Objectif jamais servi 3 jours de suite : l'application réajuste
 *     elle-même la répartition, sans poser de question.
 */
export function computeObjectiveQuota(args: {
  objective: ObjectiveItem
  servedThisWeekMinutes: number
  todayCapacityMinutes: number
  /** Capacité effective moyenne des jours connus de cette semaine (A.3). */
  averageDayCapacityMinutes: number
  daysSinceLastService: number
  /**
   * Jours actifs de la semaine. 7 par défaut (÷ 7, phases 1-2). En phases 3-4,
   * quand le volume le permet, moins de jours portent la dose (jours off).
   */
  activeDaysPerWeek?: number
}): number {
  const remainingTarget = Math.max(
    0,
    args.objective.weeklyTargetMinutes - args.servedThisWeekMinutes,
  )
  if (remainingTarget <= 0 || args.todayCapacityMinutes <= 0) return 0

  const rhythm = args.objective.weeklyTargetMinutes / (args.activeDaysPerWeek ?? DAYS_PER_WEEK)

  // Un jour plus libre que la moyenne de sa semaine en porte davantage, un jour
  // plus chargé en porte moins — le rythme, lui, ne change pas. Sans moyenne
  // connue, aucune correction n'est inventée.
  const ratio =
    args.averageDayCapacityMinutes > 0
      ? args.todayCapacityMinutes / args.averageDayCapacityMinutes
      : 1

  // Report : la journée du jour plus deux jours reportés au maximum.
  let quota = Math.min(rhythm * ratio, rhythm * 3)

  // Réajustement automatique après 3 jours sans service.
  if (args.daysSinceLastService >= 3) quota = Math.max(quota, rhythm)

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

/**
 * B.5 : ce qui tient dans UN jour sans violer le plafond de D.5 — le seuil de
 * déclenchement du découpage automatique. On retient le jour le PLUS large de
 * l'horizon : tant qu'une seule journée peut absorber la tâche entière, rien
 * ne justifie de la couper.
 */
export function maxTaskMinutesPerDay(
  capacities: Array<{ effectiveCapacityMinutes: number }>,
): number {
  return capacities.reduce(
    (max, c) =>
      Math.max(max, Math.floor(c.effectiveCapacityMinutes * TASK_CONSTANTS.maxPercentPerDay)),
    0,
  )
}

// ─── Placement par score (spec moteur 2026-09-25) ─────────────────────────
//
// « Le créneau le plus tôt à qualité égale » collait tous les blocs juste
// après le réveil. Chaque départ possible reçoit désormais un score ; les
// poids sont des valeurs de départ, que l'apprentissage remplacera.

export const SCORE_DEFAULTS = {
  /** Aucun bloc exigeant dans la première heure après le réveil (inertie du sommeil). */
  inertiaMinutes: 60,
  inertiaPenalty: 60,
  /** Deux séances d'un même objectif le même jour : au moins 3 h d'écart. */
  minGapSameObjective: 180,
  maxSessionsPerObjectivePerDay: 2,
  /** Le pic du jour, en heures après le milieu du sommeil : réveil à 7 h → pic vers 10 h (exemple de la spec). */
  peakHoursAfterMidSleep: 7,
  synchronyPerHour: 3,
  constancyPerHour: 6,
  /** Une tâche aussi s'écarte d'un bloc de la même tâche, sans interdiction. */
  softGapPerHour: 20,
  fatiguePerMinute: 0.05,
  /** Phase 2+ : partir juste après un déclencheur-événement. */
  triggerBonus: 15,
  quality: { PROFONDE: 30, NORMALE: 0, BASSE: -30 } as Record<CognitiveWindow, number>,
} as const

export type ScoreContext = {
  windowAt: (hour: number) => CognitiveWindow
  /** Heure de lever du jour, en minutes ; null si aucune nuit ne finit ce jour-là. */
  wakeMinute: number | null
  /** Milieu du sommeil, en minutes depuis minuit : estime le chronotype sans question. */
  midSleepMinute: number | null
  /** Départ habituel de ce bloc pour ce type de jour, s'il y en a déjà un. */
  habitualStart: number | null
  /**
   * Apprentissage (Thompson) : la valeur apprise d'un départ, qui remplace la
   * qualité G.2 quand il y a assez de données. Absent = qualité G.2.
   */
  learnedQuality?: (start: number) => number
  /**
   * Retrait progressif, phase 2+ : l'habitude s'accroche à un déclencheur-
   * événement (fin d'une obligation, fin d'une ancre), plus à une heure. Les
   * départs qui suivent un tel événement reçoivent ce bonus.
   */
  triggerStarts?: number[]
  /** Blocs déjà posés aujourd'hui pour le même engagement. */
  sameRefToday: Array<{ startMinute: number; endMinute: number }>
  /** Écart minimal imposé avec ces blocs (objectif : 3 h) ; 0 = aucun écart imposé. */
  hardGapMinutes: number
  /** Sans écart imposé, l'écart est-il au moins préféré ? Non pour une tâche en crise : pas de trou forcé. */
  softGap: boolean
  /**
   * « Aucun bloc exigeant dans la première heure après le réveil » : une règle,
   * pas une préférence — sauf en crise prouvée, où elle redevient une pénalité.
   */
  inertiaHard?: boolean
  /** Fatigue diagnostiquée : pénalité sur les départs après 18 h. */
  eveningPenalty?: number
  /** Un engagement arrêté par « Stop » ne revient pas avant cette minute (l'arrêt + 60). */
  notBefore?: number
  /** Minutes de charge cognitive déjà faites avant `start` (école, travail, blocs). */
  loadBefore: (start: number) => number
}

const circularHours = (a: number, b: number) => {
  const d = Math.abs(a - b) % 1440
  return Math.min(d, 1440 - d) / 60
}

export function scoreSlot(start: number, minutes: number, c: ScoreContext): number {
  const end = start + minutes
  let gap = Infinity
  for (const o of c.sameRefToday) {
    const g = start >= o.endMinute ? start - o.endMinute : o.startMinute >= end ? o.startMinute - end : -1
    gap = Math.min(gap, g)
  }
  if (c.hardGapMinutes > 0 && gap < c.hardGapMinutes) return -Infinity
  if (c.notBefore !== undefined && start < c.notBefore) return -Infinity
  let s = c.learnedQuality ? c.learnedQuality(start) : SCORE_DEFAULTS.quality[c.windowAt(Math.floor(start / 60))]
  if (c.midSleepMinute !== null) {
    const peak = (c.midSleepMinute + SCORE_DEFAULTS.peakHoursAfterMidSleep * 60) % 1440
    s -= SCORE_DEFAULTS.synchronyPerHour * circularHours(start + minutes / 2, peak)
  }
  if (c.habitualStart !== null) s -= SCORE_DEFAULTS.constancyPerHour * circularHours(start, c.habitualStart)
  if (c.wakeMinute !== null) {
    const after = start - c.wakeMinute
    if (c.inertiaHard && after >= 0 && after < SCORE_DEFAULTS.inertiaMinutes) return -Infinity
    if (after >= 0 && after < SCORE_DEFAULTS.inertiaMinutes)
      s -= (SCORE_DEFAULTS.inertiaPenalty * (SCORE_DEFAULTS.inertiaMinutes - after)) / SCORE_DEFAULTS.inertiaMinutes
  }
  if (c.hardGapMinutes === 0 && c.softGap && gap < SCORE_DEFAULTS.minGapSameObjective)
    s -= (SCORE_DEFAULTS.softGapPerHour * (SCORE_DEFAULTS.minGapSameObjective - Math.max(0, gap))) / 60
  s -= SCORE_DEFAULTS.fatiguePerMinute * c.loadBefore(start)
  if (c.eveningPenalty && start >= 18 * 60) s -= c.eveningPenalty
  if (c.triggerStarts?.some((t) => start >= t && start - t <= 5)) s += SCORE_DEFAULTS.triggerBonus
  return s
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

export type TakeOptions = {
  /** D.1.4 : cherche d'abord une fenêtre de cette qualité, sans jamais l'exiger. */
  prefer?: CognitiveWindow
  /** D.5 : évite cette qualité — budget profond du jour épuisé. Jamais un blocage. */
  avoid?: CognitiveWindow
  /** D.5 : fin du dernier bloc long du jour — le suivant s'en écarte si la place existe. */
  spreadFrom?: number
  /**
   * Placement par score (spec moteur 2026-09-25) : quand il est fourni, il
   * remplace « le plus tôt à qualité égale ». Les départs sont examinés tous
   * les quarts d'heure ; un score −Infinity rend le départ impossible.
   * `avoid` garde sa priorité ; `prefer` et `spreadFrom` sont alors ignorés —
   * la qualité et l'écart font partie du score.
   */
  score?: (start: number, minutes: number) => number
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
   * Prend `minutes` consécutives, au plus tôt par défaut.
   *   - `prefer` cherche d'abord une fenêtre de cette qualité (D.1.4).
   *   - `avoid` s'en écarte quand le budget profond du jour est épuisé (D.5).
   *   - `spreadFrom` éloigne le bloc du dernier bloc long du jour.
   * Aucune de ces trois préférences n'empêche jamais un placement : s'il ne
   * reste que la fenêtre à éviter, elle est prise quand même.
   */
  take(minutes: number, options: TakeOptions = {}): Allocation | null {
    if (minutes <= 0) return null

    if (options.score) return this.takeByScore(minutes, options.score, options.avoid)

    const target = this.spreadTarget(minutes, options.spreadFrom)
    const starts = this.candidateStarts(minutes, target)
    if (starts.length === 0) return null

    const ranked = starts.sort((a, b) => {
      if (options.avoid) {
        const rank = this.overlapsWindow(a, minutes, options.avoid) ? 1 : 0
        const other = this.overlapsWindow(b, minutes, options.avoid) ? 1 : 0
        if (rank !== other) return rank - other
      }
      if (options.prefer) {
        const rank = this.windowAt(Math.floor(a / 60)) === options.prefer ? 0 : 1
        const other = this.windowAt(Math.floor(b / 60)) === options.prefer ? 0 : 1
        if (rank !== other) return rank - other
      }
      if (target !== null) {
        const distance = Math.abs(a - target) - Math.abs(b - target)
        if (distance !== 0) return distance
      }
      return a - b
    })

    const start = ranked[0]!
    const allocation: Allocation = {
      startMinute: start,
      endMinute: start + minutes,
      cognitiveWindow: this.windowAt(Math.floor(start / 60)),
    }
    this.reserve(allocation.startMinute, allocation.endMinute)
    return allocation
  }

  private takeByScore(
    minutes: number,
    score: (start: number, minutes: number) => number,
    avoid?: CognitiveWindow,
  ): Allocation | null {
    let best: { start: number; avoided: boolean; value: number } | null = null
    for (const i of this.free) {
      const latest = i.end - minutes
      if (latest < i.start) continue
      const starts = [i.start]
      for (let q = Math.ceil(i.start / 15) * 15; q <= latest; q += 15) if (q > i.start) starts.push(q)
      for (const start of starts) {
        const value = score(start, minutes)
        if (value === -Infinity) continue
        const avoided = avoid ? this.overlapsWindow(start, minutes, avoid) : false
        const better =
          !best ||
          (avoided !== best.avoided ? !avoided : value > best.value || (value === best.value && start < best.start))
        if (better) best = { start, avoided, value }
      }
    }
    if (!best) return null
    const allocation: Allocation = {
      startMinute: best.start,
      endMinute: best.start + minutes,
      cognitiveWindow: this.windowAt(Math.floor(best.start / 60)),
    }
    this.reserve(allocation.startMinute, allocation.endMinute)
    return allocation
  }

  /**
   * D.5/A.4 : deux blocs longs le même jour s'espacent au lieu de se coller —
   * le second vise le milieu du temps qui reste après le premier. Si ce milieu
   * n'ouvre pas au moins un bloc utile (A.2), rien ne se décale : on ne crée
   * jamais un trou trop court pour servir.
   */
  private spreadTarget(minutes: number, spreadFrom?: number): number | null {
    if (spreadFrom === undefined) return null
    const lastEnd = this.free.reduce((max, i) => Math.max(max, i.end), 0)
    const target = spreadFrom + Math.floor((lastEnd - spreadFrom - minutes) / 2)
    if (target - spreadFrom < TASK_CONSTANTS.minBlockMinutes) return null
    return target
  }

  /** Départs possibles : le début de chaque trou, chaque heure pleine, et la cible d'espacement. */
  private candidateStarts(minutes: number, target: number | null): number[] {
    const starts: number[] = []
    for (const i of this.free) {
      const latest = i.end - minutes
      if (latest < i.start) continue
      starts.push(i.start)
      for (let hour = Math.ceil(i.start / 60) * 60; hour <= latest; hour += 60) {
        if (hour > i.start) starts.push(hour)
      }
      if (target !== null && target > i.start && target <= latest) starts.push(target)
    }
    return starts
  }

  /** Vrai si le bloc traverse au moins une heure de cette qualité. */
  private overlapsWindow(start: number, minutes: number, window: CognitiveWindow): boolean {
    for (
      let hour = Math.floor(start / 60);
      hour <= Math.floor((start + minutes - 1) / 60);
      hour++
    ) {
      if (this.windowAt(hour) === window) return true
    }
    return false
  }
}
