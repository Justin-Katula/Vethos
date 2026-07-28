import type { PlanningInput, PlanningResult, PlacedBlock, DayCapacity, TaskEstimate } from './types'
import { buildDayCapacity, FRAGMENT_THRESHOLDS } from './capacity'
import { estimateTask } from './estimation'
import { buildFeasibilityResult, postPlacementCheck } from './feasibility'
import { sortTasksByCascade, placeAncres, placeTaskBlocks, computeAncreMinimum, TASK_CONSTANTS, computeObjectiveQuota } from './placement'
import { computeRestFloor, computeFatigue, computeBreakMinutes } from './rest'
import { observationsByCategory } from './learning'
import type { CognitiveWindow } from './types'
import type { Ancre } from '@shared/schemas'

/**
 * Point d'entrée du moteur de planification.
 *
 * computePlan(input) → PlanningResult
 *
 * Assemble toutes les parties (A-G) dans l'ordre défini par le document :
 *   1. Calculer la capacité par jour (A)
 *   2. Estimer les tâches (B)
 *   3. Tester la faisabilité (C)
 *   4. Placer les blocs dans l'ordre D.1 (D)
 *   5. Vérifier le post-placement (C.4)
 *
 * RÈGLES ABSOLUES :
 *   - Jamais de statut "faisable" avec 0 minute placée (C.3.1).
 *   - Un déficit partiel ne bloque jamais le placement de ce qui est faisable.
 *   - Aucune question à l'utilisateur.
 */
export function computePlan(input: PlanningInput): PlanningResult {
  const { today, rangeEnd, tasks, objectives, ancres, fixedSlots, dailyRawCapacity, observations, anchorMissCounts } = input

  // ─── A. Capacité par jour ───────────────────────────────────────────────

  const capacities: DayCapacity[] = []
  const dates: string[] = []
  {
    const start = new Date(today + 'T00:00:00')
    const end = new Date(rangeEnd + 'T00:00:00')
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().slice(0, 10)
      dates.push(dateStr)
      const rawCap = dailyRawCapacity.find((c) => c.date === dateStr)?.minutes ?? 0
      const restFloor = computeRestFloor(rawCap)
      // Pour l'instant, pas de fatigue (E.4) — sera calculée quand on aura l'historique.
      const fatiguePenalty = 0

      // Créneaux libres = fixedSlots pour ce jour (simplifié : on utilise les fixedSlots globaux).
      const daySlots = fixedSlots.filter((s) => s.durationMinutes > 0)

      capacities.push(buildDayCapacity({
        date: dateStr,
        rawCapacity: rawCap,
        freeSlots: daySlots,
        restReservedMinutes: restFloor,
        fatiguePenaltyMinutes: fatiguePenalty,
        minFragment: FRAGMENT_THRESHOLDS.deepWork,
      }))
    }
  }

  // ─── B. Estimation des tâches ────────────────────────────────────────────

  const estimates: TaskEstimate[] = tasks
    .filter((t) => t.status === 'active')
    .map((t) => {
      const catObs = observationsByCategory(observations, t.category ?? 'default')
      return estimateTask({
        taskId: t.id,
        userEstimate: t.estimatedMinutes,
        category: t.category ?? 'default',
        hasDeadline: true, // toutes les tâches ont une deadline
        observations: catObs,
        durationSource: input.durationSource,
      })
    })

  // ─── C. Test de faisabilité ──────────────────────────────────────────────

  // Capacité cumulée.
  let cumulative = 0
  const cumulativeCapacity = capacities.map((c) => {
    cumulative += c.usableCapacityMinutes
    return { date: c.date, capacityMinutes: cumulative }
  })

  const feasibility = buildFeasibilityResult({
    tasks: tasks.filter((t) => t.status === 'active').map((t) => ({
      taskId: t.id,
      title: t.title,
      deadline: t.deadline,
      remainingMinutes: t.remainingMinutes,
    })),
    cumulativeCapacity,
    today,
    anchorMissCounts,
    objectivesServed: objectives.map((o) => ({
      objectiveId: o.id,
      name: o.name,
      quotaMet: true, // simplifié — sera calculé quand on aura l'historique de service
      daysSinceLastService: 0,
    })),
  })

  // ─── D. Placement des blocs ──────────────────────────────────────────────

  const allBlocks: PlacedBlock[] = []

  // D.1 Ordre : fixed → ancres → repos → objectifs → tâches

  for (const capacity of capacities) {
    // D.3 Ancres (à heure fixe).
    const dayOfWeek = ((new Date(capacity.date + 'T00:00:00').getDay()) + 6) % 7 // 0=lundi
    const dayAncres = ancres.filter((a) => a.daysOfWeek.includes(dayOfWeek))
    const ancreBlocks = placeAncres({
      ancres: dayAncres,
      date: capacity.date,
      daySaturated: capacity.usableCapacityMinutes < 60,
    })
    allBlocks.push(...ancreBlocks)

    // D.4 Objectifs (quota quotidien).
    let availableForObjAndTasks = capacity.usableCapacityMinutes

    for (const obj of objectives) {
      const quota = computeObjectiveQuota({
        objective: obj,
        daysRemainingThisWeek: Math.max(1, dates.length),
        dailyEffectiveCapacities: capacities.map((c) => c.usableCapacityMinutes),
        todayCapacity: capacity.usableCapacityMinutes,
        consecutiveDaysWithoutService: 0, // simplifié
      })
      if (quota <= 0) continue

      // Placer le quota dans le premier créneau disponible.
      const slot = capacity.slots[0]
      if (!slot || availableForObjAndTasks <= 0) continue

      const blockMinutes = Math.min(quota, slot.durationMinutes, availableForObjAndTasks, TASK_CONSTANTS.targetBlockMinutes)
      if (blockMinutes < TASK_CONSTANTS.minBlockMinutes) continue

      const breakMin = computeBreakMinutes(blockMinutes)
      allBlocks.push({
        id: `obj-${obj.id}-${capacity.date}`,
        date: capacity.date,
        startMinute: slot.startMinute,
        endMinute: slot.startMinute + blockMinutes,
        durationMinutes: blockMinutes,
        kind: 'objective',
        refId: obj.id,
        label: obj.name,
        cognitiveWindow: slot.cognitiveWindow,
        includesBreak: breakMin > 0,
        breakMinutes: breakMin,
      })
      availableForObjAndTasks -= blockMinutes
    }

    // D.5/D.6 Tâches (cascade).
    const deadlineMap = new Map<string, number>()
    for (const t of tasks.filter((t) => t.status === 'active')) {
      const deadlineMs = new Date(t.deadline + 'T23:59:59').getTime() - new Date(today + 'T00:00:00').getTime()
      deadlineMap.set(t.id, Math.max(0, Math.round(deadlineMs / 60000)))
    }

    const sortedTasks = sortTasksByCascade({ tasks, deadlineMinutesMap: deadlineMap })
    let deepBlocksToday = 0

    for (const task of sortedTasks) {
      if (availableForObjAndTasks <= 0) break
      const result = placeTaskBlocks({
        task,
        date: capacity.date,
        availableMinutes: availableForObjAndTasks,
        slots: capacity.slots,
        deepBlocksAlreadyToday: deepBlocksToday,
      })
      allBlocks.push(...result.blocks)
      deepBlocksToday += result.deepBlocksUsed
      availableForObjAndTasks -= result.minutesConsumed
    }
  }

  // ─── C.4 Post-placement check ────────────────────────────────────────────

  const totalPlaced = allBlocks
    .filter((b) => b.kind === 'task' || b.kind === 'objective')
    .reduce((sum, b) => sum + b.durationMinutes, 0)

  const totalPlanned = tasks
    .filter((t) => t.status === 'active')
    .reduce((sum, t) => sum + t.remainingMinutes, 0)

  const internalError = postPlacementCheck(totalPlaced, totalPlanned)

  // ─── Assemblage du résultat ──────────────────────────────────────────────

  return {
    blocks: allBlocks,
    capacities,
    feasibility,
    estimates,
    signals: feasibility.deficits.map((d) => ({
      type: 'density_deficit' as const,
      severity: d.severity,
      data: { deadline: d.deadline, deficitMinutes: d.deficitMinutes },
    })),
    internalError,
    totalMinutesPlaced: totalPlaced,
    totalMinutesPlanned: totalPlanned,
  }
}
