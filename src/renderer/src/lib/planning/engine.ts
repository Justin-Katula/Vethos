import type {
  AncreItem,
  DayCapacity,
  PlacedBlock,
  PlanningInput,
  PlanningResult,
  ScheduleEntry,
  TaskVerdict,
} from './types'
import { buildDayCapacity, measureFragmentThreshold } from './capacity'
import { addDays, dateKey, datesBetween, daysBetween, dayOfWeek, minutesUntilEndOf, startOfWeek } from './dates'
import { estimateTask } from './estimation'
import {
  buildFeasibilityResult,
  computeMargin,
  postPlacementCheck,
  produceSignals,
  type DayCapacityPoint,
} from './feasibility'
import { buildWindowMap, windowLookup } from './learning'
import {
  computeObjectiveQuota,
  computeTaskDayTarget,
  computeWIPLimit,
  DayAllocator,
  sortTasksByCascade,
  TASK_CONSTANTS,
  type TaskWithMargin,
} from './placement'
import { computeBreakMinutes, computeFatigue, computeRestFloor, computeWeeklyBreathing } from './rest'

/** D.6 : semaines cibles pour finir une tâche typique (W de L = λ × W). */
const WIP_TARGET_WEEKS = 2

/** L'empreinte réelle d'un bloc : le travail plus sa pause (E.1). */
function footprintFor(workMinutes: number): number {
  return workMinutes + computeBreakMinutes(workMinutes)
}

/**
 * Point d'entrée du moteur : computePlan(input) → PlanningResult.
 *
 * Fonction pure : mêmes entrées, même plan. Elle ne pose jamais de question,
 * n'affiche rien et ne notifie personne (F, C.3.2, B.6) — elle produit des
 * faits chiffrés que d'autres points consommeront.
 */
export function computePlan(input: PlanningInput, now: Date = new Date()): PlanningResult {
  const dates = datesBetween(input.today, input.rangeEnd)
  const nowMinute = dateKey(now) === input.today ? now.getHours() * 60 + now.getMinutes() : 0

  const windowAt = windowLookup(buildWindowMap(input.observations))

  // B.5 : une tâche découpée devient un simple regroupement visuel. Ce sont
  // ses sous-parties qui portent le travail — la compter aussi doublerait la
  // charge.
  const groupIds = new Set(input.tasks.map((t) => t.parentTaskId).filter((id): id is string => id !== null))
  const activeTasks = input.tasks.filter((t) => t.status === 'active' && !groupIds.has(t.id))

  // ─── B. Ce qu'il reste à placer ─────────────────────────────────────────
  //
  // `remainingMinutes` est le travail restant suivi par le store : déjà
  // corrigé par le facteur à la création (B.1/B.4), puis décrémenté au fil des
  // sessions. Quand une mesure de session existe (B.2), elle prime sur toute
  // comptabilité : c'est du temps réellement passé, pas une déclaration.
  const needByTask = new Map<string, number>()
  for (const task of activeTasks) {
    if (input.durationSource) {
      const estimate = estimateTask({ task, observations: input.observations, durationSource: input.durationSource })
      needByTask.set(task.id, estimate.measuredMinutes === null ? task.remainingMinutes : estimate.remainingMinutes)
    } else {
      needByTask.set(task.id, task.remainingMinutes)
    }
  }

  const scheduleFor = (dow: number): ScheduleEntry[] => input.schedule.filter((e) => e.dayOfWeek === dow)
  const ancresFor = (dow: number): AncreItem[] => input.ancres.filter((a) => a.daysOfWeek.includes(dow))

  // A.2.1 : seuil de fragment personnalisé dès 5 observations, défaut sinon.
  const fragmentThreshold = Math.min(
    measureFragmentThreshold(input.observations, 'routine').threshold,
    measureFragmentThreshold(input.observations, 'novel').threshold,
  )

  // ─── A + E. Capacité de chaque jour ─────────────────────────────────────
  const buildCapacities = (ancreMinimumDates: Set<string>): DayCapacity[] =>
    dates.map((date) => {
      const dow = dayOfWeek(date)
      const entries = scheduleFor(dow)
      const dayAncres = ancresFor(dow).map((a) =>
        // D.3 : la version minimale ne répond qu'à la saturation réelle du jour.
        ancreMinimumDates.has(date) ? { ...a, normalMaxMinutes: a.minimumMinutes } : a,
      )

      const restFloor = computeRestFloor(
        buildDayCapacity({
          date,
          dayOfWeek: dow,
          entries,
          ancres: dayAncres,
          restReservedMinutes: 0,
          fatiguePenaltyMinutes: 0,
          fragmentThreshold,
          windowAt,
        }).rawCapacityMinutes,
      )

      // E.4 : la fatigue se mesure sur les jours écoulés, jamais sur une
      // projection — sans mesure, pas de pénalité (G.3).
      const history = pastUtilization(date, input.dailyUtilization)
      const fatigue = computeFatigue({
        consecutiveHighDays: history,
        effectiveCapacityBeforePenalty: buildDayCapacity({
          date,
          dayOfWeek: dow,
          entries,
          ancres: dayAncres,
          restReservedMinutes: restFloor,
          fatiguePenaltyMinutes: 0,
          fragmentThreshold,
          windowAt,
        }).effectiveCapacityMinutes,
        isCrisis: false,
      })

      return buildDayCapacity({
        date,
        dayOfWeek: dow,
        entries,
        ancres: dayAncres,
        restReservedMinutes: restFloor,
        fatiguePenaltyMinutes: fatigue.penaltyMinutes,
        fragmentThreshold,
        windowAt,
      })
    })

  let capacities = buildCapacities(new Set())

  const dailyPoints = (caps: DayCapacity[]): DayCapacityPoint[] =>
    caps.map((c) => ({ date: c.date, capacityMinutes: c.effectiveCapacityMinutes }))

  const feasibilityInput = () =>
    activeTasks.map((t) => ({
      title: t.title,
      deadline: t.deadline,
      remainingMinutes: needByTask.get(t.id) ?? t.remainingMinutes,
    }))

  // ─── C.2. Test de charge, puis D.3 saturation réelle ────────────────────
  let feasibility = buildFeasibilityResult({
    tasks: feasibilityInput(),
    dailyCapacity: dailyPoints(capacities),
    today: input.today,
  })

  // Un jour est vraiment saturé quand une deadline prouvée en déficit le
  // recouvre. Recalculé frais chaque jour, jamais déduit d'un historique.
  const saturated = new Set<string>()
  for (const d of feasibility.densities) {
    if (d.feasible) continue
    for (const date of dates) if (date <= d.deadline) saturated.add(date)
  }

  if (saturated.size > 0) {
    capacities = buildCapacities(saturated)
    feasibility = buildFeasibilityResult({
      tasks: feasibilityInput(),
      dailyCapacity: dailyPoints(capacities),
      today: input.today,
    })
  }

  // ─── E.3. Respiration hebdomadaire ──────────────────────────────────────
  const breathing = applyWeeklyBreathing({ capacities, input })

  // ─── C.1 + D.6. Marges et cascade ───────────────────────────────────────
  const withMargin: TaskWithMargin[] = activeTasks.map((t) => {
    const need = needByTask.get(t.id) ?? t.remainingMinutes
    return {
      ...t,
      remainingMinutes: need,
      ...computeMargin(minutesUntilEndOf(t.deadline, input.today, nowMinute), need),
    }
  })
  const ordered = sortTasksByCascade(withMargin)

  // ─── D.1. Placement, dans l'ordre de l'immobilité ───────────────────────
  const blocks: PlacedBlock[] = []
  const placedByTask = new Map<string, number>()
  let plannedMinutes = 0

  const objectiveServed = { ...input.weeklyObjectiveServed }
  const remainingNeed = new Map(needByTask)

  for (let di = 0; di < dates.length; di++) {
    const date = dates[di]!
    const cap = capacities[di]!
    const dow = cap.dayOfWeek
    const allocator = new DayAllocator(cap.slots, windowAt)
    let budget = cap.effectiveCapacityMinutes

    // D.1.1 La réalité fixe est déjà hors des créneaux (A.1).

    // D.1.2 ANCRES — heure fixe, gelées, jamais déplacées.
    for (const ancre of ancresFor(dow)) {
      const reduced = saturated.has(date)
      const duration = reduced ? ancre.minimumMinutes : ancre.normalMaxMinutes
      allocator.reserve(ancre.anchorMinute, ancre.anchorMinute + duration)
      blocks.push({
        id: `ancre-${ancre.id}-${date}`,
        date,
        startMinute: ancre.anchorMinute,
        endMinute: ancre.anchorMinute + duration,
        durationMinutes: duration,
        breakMinutes: 0,
        workMinutes: duration,
        kind: 'ancre',
        refId: ancre.id,
        label: ancre.name,
        color: ancre.color,
        cognitiveWindow: windowAt(Math.floor(ancre.anchorMinute / 60)),
        reducedToMinimum: reduced,
      })
    }

    // D.1.3 Le repos réservé est déjà retiré de la capacité effective (E.2).

    // D.2 Préemption : une tâche à marge négative peut décaler le quota d'un
    // objectif — décalé, jamais supprimé. Jamais le sommeil, une ancre ni le
    // plancher de repos.
    const crisisToday = ordered.some(
      (t) => t.marginMinutes < 0 && (remainingNeed.get(t.id) ?? 0) > 0 && date <= t.deadline,
    )

    // D.1.4 OBJECTIFS — quota du jour, de préférence en fenêtre PROFONDE.
    if (!crisisToday) {
      const weekStart = startOfWeek(date)
      const remainingWeekCapacity = capacities
        .filter((c) => c.date >= date && startOfWeek(c.date) === weekStart)
        .reduce((s, c) => s + c.effectiveCapacityMinutes, 0)

      for (const objective of input.objectives) {
        const lastServed = input.objectiveLastServed[objective.id]
        const quota = computeObjectiveQuota({
          objective,
          servedThisWeekMinutes: objectiveServed[objective.id] ?? 0,
          todayCapacityMinutes: cap.effectiveCapacityMinutes,
          remainingWeekCapacityMinutes: remainingWeekCapacity,
          daysSinceLastService: lastServed ? Math.max(0, daysBetween(lastServed, date)) : 0,
        })

        let left = Math.min(quota, budget)
        while (left >= TASK_CONSTANTS.minBlockMinutes) {
          const work = Math.min(left, TASK_CONSTANTS.targetBlockMinutes)
          const footprint = footprintFor(work)
          const slot = allocator.take(Math.min(footprint, budget), 'PROFONDE')
          if (!slot) break

          const size = slot.endMinute - slot.startMinute
          const brk = computeBreakMinutes(size)
          const workMinutes = size - brk
          plannedMinutes += workMinutes

          blocks.push({
            id: `obj-${objective.id}-${date}-${blocks.length}`,
            date,
            startMinute: slot.startMinute,
            endMinute: slot.endMinute,
            durationMinutes: size,
            breakMinutes: brk,
            workMinutes,
            kind: 'objective',
            refId: objective.id,
            label: objective.name,
            color: objective.color,
            cognitiveWindow: slot.cognitiveWindow,
          })

          budget -= size
          left -= workMinutes
          objectiveServed[objective.id] = (objectiveServed[objective.id] ?? 0) + workMinutes
        }
      }
    }

    // D.1.5 TÂCHES — cascade D.6, découpage encouragé, plafond 40 %.
    let deepBlocksToday = 0

    for (const task of ordered) {
      if (budget < TASK_CONSTANTS.minBlockMinutes) break
      const need = remainingNeed.get(task.id) ?? 0
      if (need <= 0) continue
      // Rien n'est placé après la deadline : ce serait un plan qui ment.
      if (date > task.deadline) continue

      const remainingDayCapacities = capacities
        .filter((c) => c.date >= date && c.date <= task.deadline)
        .map((c) => c.effectiveCapacityMinutes)

      const { target, capOverride } = computeTaskDayTarget({
        remainingNeed: need,
        dayCapacity: cap.effectiveCapacityMinutes,
        remainingDayCapacities,
        isCrisis: task.marginMinutes < 0,
      })

      let dayTarget = Math.min(target, need)
      while (dayTarget >= TASK_CONSTANTS.minBlockMinutes && budget >= TASK_CONSTANTS.minBlockMinutes) {
        let work = Math.min(dayTarget, TASK_CONSTANTS.targetBlockMinutes)
        // D.5 : maximum 2 blocs profonds (90 min) par jour.
        if (work >= TASK_CONSTANTS.targetBlockMinutes && deepBlocksToday >= TASK_CONSTANTS.maxDeepBlocksPerDay) {
          work = TASK_CONSTANTS.targetBlockMinutes - 1
        }

        let footprint = Math.min(footprintFor(work), budget)
        if (footprint > allocator.largestFree()) footprint = allocator.largestFree()
        if (footprint - computeBreakMinutes(footprint) < TASK_CONSTANTS.minBlockMinutes) break

        const slot = allocator.take(footprint)
        if (!slot) break

        const size = slot.endMinute - slot.startMinute
        const brk = computeBreakMinutes(size)
        const workMinutes = size - brk
        plannedMinutes += workMinutes

        blocks.push({
          id: `task-${task.id}-${date}-${blocks.length}`,
          date,
          startMinute: slot.startMinute,
          endMinute: slot.endMinute,
          durationMinutes: size,
          breakMinutes: brk,
          workMinutes,
          kind: 'task',
          refId: task.id,
          label: task.title,
          color: '#3ECF8E',
          cognitiveWindow: slot.cognitiveWindow,
          capOverride: capOverride || undefined,
        })

        if (workMinutes >= TASK_CONSTANTS.targetBlockMinutes) deepBlocksToday++
        budget -= size
        dayTarget -= workMinutes
        remainingNeed.set(task.id, Math.max(0, (remainingNeed.get(task.id) ?? 0) - workMinutes))
        placedByTask.set(task.id, (placedByTask.get(task.id) ?? 0) + workMinutes)
      }
    }
  }

  // ─── C.3.1. Un verdict par tâche, jamais un verdict binaire global ──────
  const verdicts: TaskVerdict[] = activeTasks.map((t) => {
    const needed = needByTask.get(t.id) ?? t.remainingMinutes
    const placed = placedByTask.get(t.id) ?? 0
    return {
      taskId: t.id,
      title: t.title,
      neededMinutes: needed,
      placedMinutes: placed,
      status: placed <= 0 ? 'unplaced' : placed >= needed ? 'placed' : 'partial',
    }
  })

  // ─── C.4. Contrôle post-placement ───────────────────────────────────────
  const totalPlaced = blocks
    .filter((b) => b.kind !== 'ancre')
    .reduce((s, b) => s + b.workMinutes, 0)

  // ─── C.3.4 + F.2. Signaux ───────────────────────────────────────────────
  const signals = produceSignals({
    deficits: feasibility.deficits,
    anchorMissCounts: input.anchorMissCounts,
    objectives: input.objectives.map((o) => ({
      objectiveId: o.id,
      name: o.name,
      quotaMet: (objectiveServed[o.id] ?? 0) >= o.weeklyTargetMinutes,
      daysSinceLastService: input.objectiveLastServed[o.id]
        ? daysBetween(input.objectiveLastServed[o.id]!, input.today)
        : 0,
    })),
    lastSignalAt: input.lastSignalAt,
    now,
  })

  const wipLimit = computeWIPLimit({ tasksCreatedPerWeek: input.tasksCreatedPerWeek, targetWeeks: WIP_TARGET_WEEKS })

  return {
    blocks: blocks.sort((a, b) => a.date.localeCompare(b.date) || a.startMinute - b.startMinute),
    capacities,
    feasibility,
    signals,
    verdicts,
    totalMinutesPlaced: totalPlaced,
    totalMinutesPlanned: plannedMinutes,
    internalError: postPlacementCheck(totalPlaced, plannedMinutes),
    wip: {
      activeCount: activeTasks.length,
      limit: wipLimit,
      overLimit: activeTasks.length > wipLimit,
    },
    breathing,
  }
}

/** Jours consécutifs >85 % juste avant `date`, d'après les mesures seules (E.4). */
function pastUtilization(date: string, utilization: Record<string, number>): number {
  let count = 0
  let cursor = date
  for (let i = 0; i < 14; i++) {
    cursor = addDays(cursor, -1)
    const u = utilization[cursor]
    if (u === undefined) break
    // E.4 : un jour sous 50 % remet le compteur à zéro.
    if (u < 50) break
    if (u > 85) count++
    else break
  }
  return count
}

const NO_BREATHING = {
  targetMinutes: 0,
  restTakenMinutes: 0,
  gapMinutes: 0,
  adjustment: 'none' as const,
  reducedDates: [] as string[],
  capPercent: 100,
}

/**
 * E.3 : si le repos déjà pris cette semaine est sous la cible de 20 %,
 * l'application réduit elle-même le jour restant le moins perturbant.
 *
 * G.3 : sans jour mesuré cette semaine, il n'y a rien à comparer — aucun
 * manque de repos n'est inventé.
 */
function applyWeeklyBreathing(args: { capacities: DayCapacity[]; input: PlanningInput }) {
  const weekStart = startOfWeek(args.input.today)
  const elapsed = Object.entries(args.input.dailyUtilization)
    .filter(([date]) => date >= weekStart && date < args.input.today)
    .map(([date, utilization]) => ({
      date,
      rawCapacityMinutes: 1440,
      workedMinutes: Math.round((utilization / 100) * 1440),
    }))

  if (elapsed.length === 0) return NO_BREATHING

  const remainingRaw = args.capacities
    .filter((c) => startOfWeek(c.date) === weekStart)
    .reduce((s, c) => s + c.rawCapacityMinutes, 0)

  const breathing = computeWeeklyBreathing({
    elapsedDays: elapsed,
    weekRawCapacityMinutes: remainingRaw + elapsed.reduce((s, e) => s + e.rawCapacityMinutes, 0),
    remainingDays: args.capacities
      .filter((c) => c.date >= args.input.today && startOfWeek(c.date) === weekStart)
      .map((c) => ({ date: c.date, demandMinutes: c.effectiveCapacityMinutes })),
  })

  // Le plafond s'applique en réduisant la capacité effective du jour choisi.
  for (const date of breathing.reducedDates) {
    const cap = args.capacities.find((c) => c.date === date)
    if (!cap) continue
    const capped = Math.round(cap.effectiveCapacityMinutes * (breathing.capPercent / 100))
    cap.breathingReductionMinutes = cap.effectiveCapacityMinutes - capped
    cap.effectiveCapacityMinutes = capped
  }

  return breathing
}
