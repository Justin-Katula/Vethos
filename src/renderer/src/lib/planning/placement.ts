import type { PlacedBlock, DayCapacity, CognitiveWindow } from './types'
import type { Task, Objective, Ancre } from '@shared/schemas'
import { computeMargin } from './feasibility'
import { computeBreakMinutes } from './rest'

/**
 * Partie D — Ordre de placement.
 *
 * D.1 Ordre (fondé sur l'immobilité) : réalité fixe → ancres → repos → objectifs → tâches.
 * D.2 Préemption (fondée sur l'urgence, hiérarchie SÉPARÉE de D.1).
 * D.3 Règles ANCRES (heure fixe, ne bouge jamais, minimum calculé).
 * D.4 Règles OBJECTIFS (cible hebdomadaire, quota quotidien, jamais 3 jours sans service).
 * D.5 Règles TÂCHES (EDF → importance → SRPT → création, bloc 90 min, plafond 40%).
 * D.6 Cascade complète (règle définitive de priorité).
 */

// ─── D.5 Constantes ────────────────────────────────────────────────────────

export const TASK_CONSTANTS = {
  /** Plafond de sécurité : 40% de la capacité effective du jour par tâche. */
  maxPercentPerDay: 0.4,
  /** Taille de bloc cible : 90 minutes. */
  targetBlockMinutes: 90,
  /** Bloc minimum : 25 minutes. */
  minBlockMinutes: 25,
  /** Maximum 2 blocs de travail profond (90 min) par jour. */
  maxDeepBlocksPerDay: 2,
} as const

// ─── D.1 Ordre d'immobilité ────────────────────────────────────────────────

export type PlacementLayer = 'fixed' | 'anchor' | 'rest' | 'objective' | 'task'

export const PLACEMENT_ORDER: PlacementLayer[] = ['fixed', 'anchor', 'rest', 'objective', 'task']

// ─── D.6 Cascade complète de tri des tâches ────────────────────────────────

export type TaskWithMeta = Task & {
  marginMinutes: number
  urgency: number
  marginStatus: 'comfortable' | 'now' | 'overdue'
}

/**
 * D.6 : cascade complète de priorité des tâches.
 *
 * 1. DEADLINE/marge (EDF) : une tâche en vraie crise de deadline passe toujours en premier.
 * 2. IMPORTANCE déclarée (C.1.1) — la plus haute passe en premier.
 * 3. SRPT — la tâche avec le MOINS de travail restant est servie en premier.
 * 4. Égalité totale sur les trois : ordre de création, la plus ancienne d'abord.
 *
 * Jamais aléatoire.
 */
export function sortTasksByCascade(args: {
  tasks: Task[]
  /** Minutes jusqu'à la deadline pour chaque tâche. */
  deadlineMinutesMap: Map<string, number>
}): TaskWithMeta[] {
  const { tasks, deadlineMinutesMap } = args

  const withMeta: TaskWithMeta[] = tasks
    .filter((t) => t.status === 'active')
    .map((t) => {
      const deadlineMin = deadlineMinutesMap.get(t.id) ?? 0
      const m = computeMargin(deadlineMin, t.remainingMinutes)
      return {
        ...t,
        marginMinutes: m.marginMinutes,
        urgency: m.urgency,
        marginStatus: m.status,
      }
    })

  // Tri stable selon la cascade exacte.
  withMeta.sort((a, b) => {
    // 1. DEADLINE : marge la plus négative en premier (urgence maximale).
    if (a.marginMinutes !== b.marginMinutes) {
      return a.marginMinutes - b.marginMinutes
    }
    // 2. IMPORTANCE décroissante.
    if (a.importance !== b.importance) {
      return b.importance - a.importance
    }
    // 3. SRPT : le moins de travail restant en premier.
    if (a.remainingMinutes !== b.remainingMinutes) {
      return a.remainingMinutes - b.remainingMinutes
    }
    // 4. Ordre de création (la plus ancienne d'abord).
    return a.createdAt.localeCompare(b.createdAt)
  })

  return withMeta
}

// ─── D.3 Placement des ancres ──────────────────────────────────────────────

/**
 * D.3 : place les ancres à heure fixe.
 * - minimum_ancre = MAX(20 minutes, 40% × normalMaxMinutes).
 * - La version minimale est dernier recours, calculée par saturation réelle.
 */
export function computeAncreMinimum(normalMaxMinutes: number): number {
  return Math.max(20, Math.round(normalMaxMinutes * 0.4))
}

/**
 * Place les ancres dans les créneaux, à heure fixe. Ne peut pas être déplacée.
 */
export function placeAncres(args: {
  ancres: Ancre[]
  date: string
  /** True si la journée est saturée (forcer version minimale). */
  daySaturated: boolean
}): PlacedBlock[] {
  return args.ancres.map((a) => {
    const duration = args.daySaturated ? a.minimumMinutes : a.normalMaxMinutes
    return {
      id: `ancre-${a.id}-${args.date}`,
      date: args.date,
      startMinute: a.anchorMinute,
      endMinute: a.anchorMinute + duration,
      durationMinutes: duration,
      kind: 'ancre' as const,
      refId: a.id,
      label: a.name,
      cognitiveWindow: 'NORMALE' as CognitiveWindow,
      includesBreak: false,
      breakMinutes: 0,
    }
  })
}

// ─── D.4 Placement des objectifs ───────────────────────────────────────────

/**
 * D.4 : quota quotidien d'un objectif.
 *   quota_quotidien = cible_hebdomadaire ÷ jours restants disponibles cette semaine,
 *   ajusté par la capacité effective de chaque jour (pas un partage égal).
 */
export function computeObjectiveQuota(args: {
  objective: Objective
  daysRemainingThisWeek: number
  dailyEffectiveCapacities: number[]
  todayCapacity: number
  /** Jours consécutifs sans service de cet objectif. */
  consecutiveDaysWithoutService: number
}): number {
  const { objective, daysRemainingThisWeek, dailyEffectiveCapacities, todayCapacity, consecutiveDaysWithoutService } = args

  // D.4 : si objectif non servi 3 jours consécutifs → réajustement automatique.
  if (consecutiveDaysWithoutService >= 3) {
    // Réajuste en augmentant le quota d'aujourd'hui pour rattraper.
    const totalRemainingCapacity = dailyEffectiveCapacities.reduce((s, c) => s + c, 0)
    if (totalRemainingCapacity <= 0) return 0
    // Part d'aujourd'hui proportionnelle.
    return Math.round((todayCapacity / totalRemainingCapacity) * objective.weeklyTargetMinutes * 1.5)
  }

  const totalRemainingCapacity = dailyEffectiveCapacities.reduce((s, c) => s + c, 0)
  if (totalRemainingCapacity <= 0 || daysRemainingThisWeek <= 0) return 0

  // D.4 : ajusté par capacité effective (pas partage égal).
  const proportion = todayCapacity / totalRemainingCapacity
  return Math.round(objective.weeklyTargetMinutes * (daysRemainingThisWeek > 0 ? 1 / daysRemainingThisWeek : 1) * proportion * daysRemainingThisWeek)
}

// ─── D.5 Taille de bloc cible pour les tâches ──────────────────────────────

/**
 * D.5 : taille de bloc cible.
 *   bloc_cible = min(besoin_restant, 90 minutes, plafond_40%_du_jour)
 */
export function computeTargetBlockSize(args: {
  remainingMinutes: number
  effectiveCapacityMinutes: number
}): number {
  const cap40 = Math.round(args.effectiveCapacityMinutes * TASK_CONSTANTS.maxPercentPerDay)
  return Math.min(
    args.remainingMinutes,
    TASK_CONSTANTS.targetBlockMinutes,
    cap40,
  )
}

/**
 * D.5 : répartition proportionnelle sous pression réelle.
 *   part_jour = (capacité_effective_du_jour / somme_capacités_effectives_jours_restants) × besoin_total_restant
 */
export function computeProportionalShare(args: {
  todayEffectiveCapacity: number
  totalRemainingCapacities: number
  totalRemainingWork: number
}): number {
  if (args.totalRemainingCapacities <= 0) return 0
  return Math.round((args.todayEffectiveCapacity / args.totalRemainingCapacities) * args.totalRemainingWork)
}

// ─── D.5 Placement des tâches (génération de blocs) ────────────────────────

/**
 * D.5 : génère les blocs pour une tâche dans un jour donné.
 * - Découpe en blocs de 90 min (targetBlock).
 * - Max 2 blocs profonds par jour.
 * - Bloc minimum 25 min.
 * - Micro-repos inclus (E.1).
 */
export function placeTaskBlocks(args: {
  task: TaskWithMeta
  date: string
  availableMinutes: number
  slots: DayCapacity['slots']
  deepBlocksAlreadyToday: number
}): { blocks: PlacedBlock[]; deepBlocksUsed: number; minutesConsumed: number } {
  const { task, date, availableMinutes, slots, deepBlocksAlreadyToday } = args
  const blocks: PlacedBlock[] = []
  let remaining = Math.min(task.remainingMinutes, availableMinutes)
  let deepBlocks = deepBlocksAlreadyToday
  let minutesUsed = 0
  let slotIndex = 0

  while (remaining > 0 && slotIndex < slots.length) {
    const slot = slots[slotIndex]!
    const slotRemaining = slot.durationMinutes - minutesUsed + (minutesUsed > 0 ? 0 : 0)

    // Calculer la taille de bloc possible.
    const cap40 = Math.round(args.availableMinutes * TASK_CONSTANTS.maxPercentPerDay)
    let blockSize = Math.min(
      remaining,
      TASK_CONSTANTS.targetBlockMinutes,
      cap40 - minutesUsed,
      slot.durationMinutes,
    )

    // Dernier bloc trop petit → pas de bloc.
    if (blockSize < TASK_CONSTANTS.minBlockMinutes && remaining > TASK_CONSTANTS.minBlockMinutes) {
      blockSize = TASK_CONSTANTS.minBlockMinutes // Garde-fou : au moins 25 min
    }
    if (blockSize < TASK_CONSTANTS.minBlockMinutes) break // pas assez de place

    // Max 2 blocs profonds par jour.
    const isDeepBlock = blockSize >= TASK_CONSTANTS.targetBlockMinutes
    if (isDeepBlock && deepBlocks >= TASK_CONSTANTS.maxDeepBlocksPerDay) {
      // Découpe en bloc plus petit.
      blockSize = Math.min(blockSize, 50)
      if (blockSize < TASK_CONSTANTS.minBlockMinutes) break
    }

    const breakMinutes = computeBreakMinutes(blockSize)
    const block: PlacedBlock = {
      id: `task-${task.id}-${date}-${blocks.length}`,
      date,
      startMinute: slot.startMinute + minutesUsed,
      endMinute: slot.startMinute + minutesUsed + blockSize,
      durationMinutes: blockSize,
      kind: 'task',
      refId: task.id,
      label: task.title,
      cognitiveWindow: slot.cognitiveWindow,
      includesBreak: breakMinutes > 0,
      breakMinutes,
    }
    blocks.push(block)
    remaining -= blockSize
    minutesUsed += blockSize + breakMinutes
    if (isDeepBlock) deepBlocks++

    // Slot épuisé → suivant.
    if (minutesUsed >= slot.durationMinutes) {
      slotIndex++
      minutesUsed = 0
    }
  }

  return {
    blocks,
    deepBlocksUsed: deepBlocks - deepBlocksAlreadyToday,
    minutesConsumed: blocks.reduce((s, b) => s + b.durationMinutes, 0),
  }
}

// ─── D.2 Préemption ────────────────────────────────────────────────────────

export type PreemptionAction = {
  taskId: string
  /** Ce sur quoi la tâche peut prendre (quota objectif, repos au-delà du plancher). */
  source: 'objective_quota' | 'excess_rest'
  minutesTaken: number
}

/**
 * D.2 : une tâche à marge négative PEUT prendre sur :
 *   - le quota du jour d'un objectif (décalé, jamais supprimé)
 *   - le repos au-delà du plancher minimum
 *
 * Une tâche à marge négative NE PEUT JAMAIS prendre sur :
 *   - le sommeil
 *   - une ancre
 *   - le plancher de repos minimum (E.2)
 *
 * Hiérarchie SÉPARÉE de D.1 — ne change pas l'ordre de placement,
 * mais autorise un dépassement de plafond en cas de crise.
 */
export function applyPreemption(args: {
  crisisTask: TaskWithMeta
  objectiveQuotas: Array<{ objectiveId: string; minutes: number }>
  restReservedMinutes: number
  restFloorMinutes: number
  deficitMinutes: number
}): PreemptionAction[] {
  const actions: PreemptionAction[] = []
  let needed = args.deficitMinutes

  if (needed <= 0) return actions

  // 1. Peut prendre sur le quota objectif (décalé, jamais supprimé).
  for (const quota of args.objectiveQuotas) {
    if (needed <= 0) break
    const take = Math.min(needed, Math.round(quota.minutes * 0.5)) // max 50% du quota
    if (take > 0) {
      actions.push({ taskId: args.crisisTask.id, source: 'objective_quota', minutesTaken: take })
      needed -= take
    }
  }

  // 2. Peut prendre sur le repos au-delà du plancher minimum.
  if (needed > 0) {
    const excessRest = Math.max(0, args.restReservedMinutes - args.restFloorMinutes)
    const take = Math.min(needed, excessRest)
    if (take > 0) {
      actions.push({ taskId: args.crisisTask.id, source: 'excess_rest', minutesTaken: take })
    }
  }

  return actions
}

// ─── D.6 WIP (Work In Progress) limite ────────────────────────────────────

/**
 * D.6 : WIP_limite = λ (tâches créées/semaine, mesuré) × W (semaines cible pour finir).
 * Démarrage à froid : défaut 3-4 tâches actives.
 */
export function computeWIPLimit(args: {
  tasksCreatedPerWeek: number
  weeksToFinish: number
}): number {
  if (args.tasksCreatedPerWeek <= 0) return 4 // démarrage à froid
  return Math.max(1, Math.round(args.tasksCreatedPerWeek * args.weeksToFinish))
}
