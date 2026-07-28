import type { FeasibilityResult, PlanningSignal } from './types'

/**
 * Partie C — Test de faisabilité.
 *
 * C.1 Marge et urgence (TÂCHES UNIQUEMENT).
 * C.2 Test de charge (densité par deadline).
 * C.3 Diagnostic quantitatif (déficit chiffré + options de résolution).
 * C.3.1 Placement partiel obligatoire (jamais 0 si quelque chose peut être placé).
 * C.3.3 Sévérité proportionnelle au déficit de densité.
 * C.3.4 Signaux (liste fermée : density_deficit, anchor_missed_3x, objective_stalled).
 * C.4 Contrôle post-placement.
 */

// ─── C.1 Marge et urgence ──────────────────────────────────────────────────

export type TaskMargin = {
  taskId: string
  deadline: string
  /** marge_tâche = (deadline − maintenant) − travail_restant. (C.1) */
  marginMinutes: number
  /** URGENCE = inverse de la marge. Jamais un calcul séparé. */
  urgency: number
  /** marge > 0 → jeu. marge = 0 → commencer maintenant. marge < 0 → RETARD. */
  status: 'comfortable' | 'now' | 'overdue'
}

/**
 * C.1 : marge_tâche = (deadline − maintenant) − travail_restant.
 *
 * @param deadlineMinutes Minutes jusqu'à la deadline (deadline − maintenant).
 * @param remainingWorkMinutes Travail restant en minutes (remainingMinutes de la tâche).
 */
export function computeMargin(
  deadlineMinutes: number,
  remainingWorkMinutes: number,
): { marginMinutes: number; urgency: number; status: 'comfortable' | 'now' | 'overdue' } {
  const marginMinutes = deadlineMinutes - remainingWorkMinutes
  const urgency = marginMinutes <= 0 ? Infinity : 1 / marginMinutes
  const status: 'comfortable' | 'now' | 'overdue' =
    marginMinutes > 0 ? 'comfortable' : marginMinutes === 0 ? 'now' : 'overdue'
  return { marginMinutes, urgency, status }
}

// ─── C.1.1 Importance (déclarée, jamais recalculée) ──────────────────────

/**
 * C.1.1 : niveau_importance(tâche) = 1 à 10, déclaré UNE SEULE FOIS.
 * Jamais recalculé. Jamais dérivé d'une catégorie.
 *
 * Ce point ne fait que VALIDER que l'importance est dans [1, 10].
 * Le stockage se fait dans le schema Task.
 */
export function validateImportance(importance: number): boolean {
  return Number.isInteger(importance) && importance >= 1 && importance <= 10
}

// ─── C.2 Test de charge (densité par deadline) ─────────────────────────────

export type DensityCheck = {
  deadline: string
  loadMinutes: number
  capacityMinutes: number
  density: number
  feasible: boolean
}

/**
 * C.2 : pour chaque deadline distincte D :
 *   charge(D) = somme du travail restant de toutes les tâches dont la deadline ≤ D
 *   capacité(D) = capacité effective cumulée entre maintenant et D
 *   densité(D) = charge(D) / capacité(D)
 *
 *   densité ≤ 1 → FAISABLE (prouvé)
 *   densité > 1 → IMPOSSIBLE (prouvé)
 */
export function computeDensities(args: {
  /** Tâches avec deadline + travail restant. */
  tasks: Array<{ taskId: string; deadline: string; remainingMinutes: number }>
  /** Capacité effective cumulée par date (jusqu'à cette date incluse). */
  cumulativeCapacity: Array<{ date: string; capacityMinutes: number }>
  /** Date d'aujourd'hui (pour ignorer les tâches passées). */
  today: string
}): DensityCheck[] {
  const { tasks, cumulativeCapacity, today } = args

  // Deadlines distinctes triées.
  const deadlines = [...new Set(tasks.map((t) => t.deadline))].sort()

  return deadlines.map((deadline) => {
    // Charge : somme du travail restant de toutes les tâches ≤ D.
    const loadMinutes = tasks
      .filter((t) => t.deadline <= deadline)
      .reduce((sum, t) => sum + t.remainingMinutes, 0)

    // Capacité : cumulée entre aujourd'hui et D.
    const capEntry = cumulativeCapacity.find((c) => c.date >= today && c.date >= deadline) ??
      cumulativeCapacity.filter((c) => c.date >= today && c.date <= deadline)
        .reduce(
          (acc, c) => ({ date: deadline, capacityMinutes: acc.capacityMinutes + c.capacityMinutes }),
          { date: deadline, capacityMinutes: 0 },
        )

    const capacityMinutes = capEntry.capacityMinutes
    const density = capacityMinutes > 0 ? loadMinutes / capacityMinutes : loadMinutes > 0 ? Infinity : 0

    return {
      deadline,
      loadMinutes,
      capacityMinutes,
      density,
      feasible: density <= 1,
    }
  })
}

// ─── C.3 Diagnostic quantitatif ────────────────────────────────────────────

export type DeficitDiagnosis = {
  deadline: string
  deficitMinutes: number
  /** C.3.3 : <10% → passive, 10-30% → passive, >30% → high/critical. */
  severity: 'passive' | 'high' | 'critical'
  /** Au moins 2-3 options concrètes chiffrées. */
  options: Array<{ action: string; minutesFreed: number }>
}

/**
 * C.3 : quand densité > 1, produire le déficit exact + options de résolution.
 */
export function diagnoseDeficit(density: DensityCheck, allTasks: Array<{ title: string; remainingMinutes: number; deadline: string }>): DeficitDiagnosis | null {
  if (density.density <= 1) return null

  const deficitMinutes = density.loadMinutes - density.capacityMinutes
  const deficitPercent = density.capacityMinutes > 0 ? deficitMinutes / density.capacityMinutes : 1

  // C.3.3 Sévérité proportionnelle.
  const severity: 'passive' | 'high' | 'critical' =
    deficitPercent > 0.3 ? 'critical' : deficitPercent >= 0.1 ? 'passive' : 'passive'

  // C.3 : au moins 2-3 options concrètes chiffrées.
  const options: Array<{ action: string; minutesFreed: number }> = []

  // Option 1 : repousser la deadline de la tâche la moins urgente.
  const sortedByRemaining = [...allTasks].sort((a, b) => b.remainingMinutes - a.remainingMinutes)
  if (sortedByRemaining[0]) {
    options.push({
      action: `Repousser ou réduire "${sortedByRemaining[0].title}"`,
      minutesFreed: sortedByRemaining[0].remainingMinutes,
    })
  }
  // Option 2 : réduire le travail restant de la 2e tâche.
  if (sortedByRemaining[1]) {
    options.push({
      action: `Réduire "${sortedByRemaining[1].title}"`,
      minutesFreed: Math.round(sortedByRemaining[1].remainingMinutes * 0.5),
    })
  }
  // Option 3 : retirer entièrement une tâche.
  if (sortedByRemaining[0]) {
    options.push({
      action: `Retirer "${sortedByRemaining[0].title}"`,
      minutesFreed: sortedByRemaining[0].remainingMinutes,
    })
  }

  return { deadline: density.deadline, deficitMinutes, severity, options }
}

// ─── C.3.4 Signaux (liste fermée) ──────────────────────────────────────────

/**
 * C.3.4 : seuls signaux autorisés :
 * 1. density_deficit (au-delà du seuil C.3.3)
 * 2. anchor_missed_3x (signal passif, aucune action auto)
 * 3. objective_stalled (signal passif)
 */
export function produceSignals(args: {
  densities: DensityCheck[]
  deficits: (DeficitDiagnosis | null)[]
  anchorMissCounts: Record<string, number>
  objectivesServed: Array<{ objectiveId: string; name: string; quotaMet: boolean; daysSinceLastService: number }>
}): PlanningSignal[] {
  const signals: PlanningSignal[] = []

  // 1. density_deficit
  for (const d of args.deficits) {
    if (d && (d.severity === 'high' || d.severity === 'critical')) {
      signals.push({
        type: 'density_deficit',
        severity: d.severity,
        data: { deadline: d.deadline, deficitMinutes: d.deficitMinutes, options: d.options },
      })
    }
  }

  // 2. anchor_missed_3x
  for (const [ancreId, count] of Object.entries(args.anchorMissCounts)) {
    if (count >= 3) {
      signals.push({
        type: 'anchor_missed_3x',
        severity: 'passive',
        data: { ancreId, missedCount: count },
      })
    }
  }

  // 3. objective_stalled
  for (const obj of args.objectivesServed) {
    if (!obj.quotaMet && obj.daysSinceLastService >= 3) {
      signals.push({
        type: 'objective_stalled',
        severity: 'passive',
        data: { objectiveId: obj.objectiveId, name: obj.name, daysSinceLastService: obj.daysSinceLastService },
      })
    }
  }

  return signals
}

// ─── C.4 Contrôle post-placement ───────────────────────────────────────────

/**
 * C.4 : minutes_réellement_placées == minutes_prévues_par_le_plan ?
 * Si non : signaler comme bug interne, jamais absorber silencieusement.
 */
export function postPlacementCheck(
  totalPlaced: number,
  totalPlanned: number,
): { expected: number; actual: number; diff: number } | undefined {
  if (totalPlaced !== totalPlanned) {
    return { expected: totalPlanned, actual: totalPlaced, diff: totalPlanned - totalPlaced }
  }
  return undefined
}

// ─── C.2 Convenience : assembler un FeasibilityResult ──────────────────────

/**
 * Assemble le résultat de faisabilité complet (C.2 + C.3 + signaux).
 */
export function buildFeasibilityResult(args: {
  tasks: Array<{ taskId: string; title: string; deadline: string; remainingMinutes: number }>
  cumulativeCapacity: Array<{ date: string; capacityMinutes: number }>
  today: string
  anchorMissCounts: Record<string, number>
  objectivesServed: Array<{ objectiveId: string; name: string; quotaMet: boolean; daysSinceLastService: number }>
}): FeasibilityResult {
  const densities = computeDensities({
    tasks: args.tasks.map((t) => ({ taskId: t.taskId, deadline: t.deadline, remainingMinutes: t.remainingMinutes })),
    cumulativeCapacity: args.cumulativeCapacity,
    today: args.today,
  })

  const deficits = densities.map((d) => diagnoseDeficit(d, args.tasks))

  const signals = produceSignals({
    densities,
    deficits,
    anchorMissCounts: args.anchorMissCounts,
    objectivesServed: args.objectivesServed,
  })

  return {
    densities,
    globallyFeasible: densities.every((d) => d.feasible),
    deficits: deficits.filter((d): d is DeficitDiagnosis => d !== null),
    // Note: signals seront ajoutés au niveau PlanningResult dans engine.ts
  } as FeasibilityResult
}
