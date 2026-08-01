import type { PlanningInput, PlanningResult, PlacedBlock, DayCapacity } from './types'
import { buildDayCapacity, generateFreeSlots, computeRawCapacity, FRAGMENT_THRESHOLDS } from './capacity'
import { estimateTask } from './estimation'
import { buildFeasibilityResult, postPlacementCheck, produceSignals } from './feasibility'
import { sortTasksByCascade, placeAncres, placeTaskBlocks, computeObjectiveQuota, TASK_CONSTANTS } from './placement'
import { computeRestFloor, computeBreakMinutes } from './rest'
import { byCategory } from './learning'

/**
 * Point d'entrée : computePlan(input) → PlanningResult.
 * Assemble les parties A-G dans l'ordre du document.
 * Critère 1 : jamais 0 minute placée si des tâches existent.
 * Critère 2 : déficit partiel ne bloque jamais.
 * Critère 7 : aucune question à l'utilisateur.
 */
export function computePlan(input: PlanningInput): PlanningResult {
  const { today, rangeEnd, tasks, objectives, ancres, schedule, observations, anchorMissCounts } = input

  // ─── Dates de la semaine ────────────────────────────────────────────────
  const dates: string[] = []
  const start = new Date(today + 'T00:00:00')
  const end = new Date(rangeEnd + 'T00:00:00')
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10))
  }

  // ─── A. Capacité par jour ───────────────────────────────────────────────
  const capacities: DayCapacity[] = dates.map((date) => {
    const dow = (new Date(date + 'T00:00:00').getDay() + 6) % 7
    const daySchedule = schedule.filter((e) => e.dayOfWeek === dow)
    const rawCap = computeRawCapacity(daySchedule)
    const restFloor = computeRestFloor(rawCap)
    const freeSlots = generateFreeSlots(daySchedule)
    return buildDayCapacity({ date, rawCapacity: rawCap, freeSlots, restReservedMinutes: restFloor, fatiguePenaltyMinutes: 0 })
  })

  // ─── C. Faisabilité ─────────────────────────────────────────────────────
  let cumul = 0
  const cumulativeCapacity = capacities.map((c) => { cumul += c.usableCapacityMinutes; return { date: c.date, capacityMinutes: cumul } })
  const activeTasks = tasks.filter((t) => t.status === 'active')
  const feasibility = buildFeasibilityResult({
    tasks: activeTasks.map((t) => ({ taskId: t.id, title: t.title, deadline: t.deadline, remainingMinutes: t.remainingMinutes })),
    cumulativeCapacity, today,
    anchorMissCounts,
  })

  // ─── D. Placement ───────────────────────────────────────────────────────
  const allBlocks: PlacedBlock[] = []

  // Map des minutes deadline pour la cascade.
  const deadlineMap = new Map<string, number>()
  for (const t of activeTasks) {
    const ms = new Date(t.deadline + 'T23:59:59').getTime() - new Date(today + 'T00:00:00').getTime()
    deadlineMap.set(t.id, Math.max(0, Math.round(ms / 60000)))
  }
  const sortedTasks = sortTasksByCascade(activeTasks, deadlineMap)

  // Capacité totale restante (pour objectifs proportionnels).
  const totalRemainingCap = capacities.reduce((s, c) => s + c.usableCapacityMinutes, 0)

  for (let di = 0; di < dates.length; di++) {
    const cap = capacities[di]!
    const dow = (new Date(cap.date + 'T00:00:00').getDay() + 6) % 7

    // D.1.1 Réalité fixe (déjà dans le schedule via generateFreeSlots).

    // D.1.2 Ancres
    const dayAncres = ancres.filter((a) => a.daysOfWeek.includes(dow))
    allBlocks.push(...placeAncres(dayAncres, cap.date, cap.usableCapacityMinutes < 60))

    // D.1.3 Repos réservé (déjà déduit dans usableCapacityMinutes via restFloor).

    // D.1.4 Objectifs
    let avail = cap.usableCapacityMinutes
    for (const obj of objectives) {
      const quota = computeObjectiveQuota({
        objective: obj, daysRemaining: dates.length - di,
        totalRemainingCapacity: totalRemainingCap, todayCapacity: cap.usableCapacityMinutes,
      })
      if (quota <= 0 || avail <= 0) continue
      const slot = cap.slots[0]
      if (!slot) continue
      const blockMin = Math.min(quota, slot.durationMinutes, avail, TASK_CONSTANTS.targetBlockMinutes)
      if (blockMin < TASK_CONSTANTS.minBlockMinutes) continue
      allBlocks.push({
        id: `obj-${obj.id}-${cap.date}`, date: cap.date, startMinute: slot.startMinute,
        endMinute: slot.startMinute + blockMin, durationMinutes: blockMin, kind: 'objective',
        refId: obj.id, label: obj.name, color: obj.color, cognitiveWindow: slot.cognitiveWindow,
        breakMinutes: computeBreakMinutes(blockMin),
      })
      avail -= blockMin
    }

    // D.1.5 Tâches (cascade D.6)
    let deepToday = 0
    for (const task of sortedTasks) {
      if (avail <= 0) break
      const result = placeTaskBlocks({ task, date: cap.date, availableMinutes: avail, slots: cap.slots, deepBlocksToday: deepToday })
      allBlocks.push(...result.blocks)
      deepToday += result.deepBlocksUsed
      avail -= result.minutesConsumed
    }
  }

  // ─── C.4 Post-placement ─────────────────────────────────────────────────
  const totalPlaced = allBlocks.filter((b) => b.kind === 'task' || b.kind === 'objective').reduce((s, b) => s + b.durationMinutes, 0)
  const totalPlanned = activeTasks.reduce((s, t) => s + t.remainingMinutes, 0)
  const internalError = postPlacementCheck(totalPlaced, totalPlanned)

  // ─── C.3.4 Signaux ──────────────────────────────────────────────────────
  const signals = produceSignals({
    deficits: feasibility.deficits,
    anchorMissCounts,
    objectivesServed: objectives.map((o) => ({
      objectiveId: o.id, name: o.name, quotaMet: true, daysSinceLastService: 0,
    })),
  })

  return { blocks: allBlocks, capacities, feasibility, signals, totalMinutesPlaced: totalPlaced, totalMinutesPlanned: totalPlanned, internalError }
}
