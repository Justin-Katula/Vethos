import type { FeasibilityResult, PlanningSignal } from './types'

// ═══ PARTIE C — TEST DE FAISABILITÉ ═══════════════════════════════════════

/** C.1 : marge = (deadline − maintenant) − travail_restant. */
export function computeMargin(deadlineMin: number, remainingMin: number) {
  const m = deadlineMin - remainingMin
  return {
    marginMinutes: m,
    urgency: m <= 0 ? Infinity : 1 / m,
    marginStatus: m > 0 ? 'comfortable' as const : m === 0 ? 'now' as const : 'overdue' as const,
  }
}

/** C.1.1 : importance est validée [1,10], déclarée une fois. */
export function validateImportance(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= 10
}

/** C.2 : densité par deadline. */
export function computeDensities(args: {
  tasks: Array<{ taskId: string; deadline: string; remainingMinutes: number }>
  cumulativeCapacity: Array<{ date: string; capacityMinutes: number }>
  today: string
}) {
  const deadlines = [...new Set(args.tasks.map((t) => t.deadline))].sort()
  return deadlines.map((deadline) => {
    const load = args.tasks.filter((t) => t.deadline <= deadline).reduce((s, t) => s + t.remainingMinutes, 0)
    const cap = args.cumulativeCapacity.filter((c) => c.date >= args.today && c.date <= deadline).reduce((s, c) => s + c.capacityMinutes, 0)
    const density = cap > 0 ? load / cap : load > 0 ? Infinity : 0
    return { deadline, loadMinutes: load, capacityMinutes: cap, density, feasible: density <= 1 }
  })
}

/** C.3 : diagnostic du déficit. */
export function diagnoseDeficit(d: { deadline: string; loadMinutes: number; capacityMinutes: number; density: number }, tasks: Array<{ title: string; remainingMinutes: number }>) {
  if (d.density <= 1) return null
  const deficit = d.loadMinutes - d.capacityMinutes
  const pct = d.capacityMinutes > 0 ? deficit / d.capacityMinutes : 1
  const severity = pct > 0.3 ? 'critical' as const : 'passive' as const
  const sorted = [...tasks].sort((a, b) => b.remainingMinutes - a.remainingMinutes)
  return {
    deadline: d.deadline, deficitMinutes: deficit, severity,
    options: [
      sorted[0] ? { action: `Repousser "${sorted[0].title}"`, minutesFreed: sorted[0].remainingMinutes } : null,
      sorted[1] ? { action: `Réduire "${sorted[1].title}"`, minutesFreed: Math.round(sorted[1].remainingMinutes * 0.5) } : null,
      sorted[0] ? { action: `Retirer "${sorted[0].title}"`, minutesFreed: sorted[0].remainingMinutes } : null,
    ].filter((x): x is { action: string; minutesFreed: number } => x !== null),
  }
}

/** C.3.4 : signaux (liste fermée). */
export function produceSignals(args: {
  deficits: Array<{ deadline: string; deficitMinutes: number; severity: 'passive' | 'high' | 'critical' }>
  anchorMissCounts: Record<string, number>
  objectivesServed: Array<{ objectiveId: string; name: string; quotaMet: boolean; daysSinceLastService: number }>
}): PlanningSignal[] {
  const s: PlanningSignal[] = []
  for (const d of args.deficits) {
    if (d.severity === 'high' || d.severity === 'critical') {
      s.push({ type: 'density_deficit', severity: d.severity, data: { deadline: d.deadline, deficitMinutes: d.deficitMinutes } })
    }
  }
  for (const [id, count] of Object.entries(args.anchorMissCounts)) {
    if (count >= 3) s.push({ type: 'anchor_missed_3x', severity: 'passive', data: { ancreId: id, missedCount: count } })
  }
  for (const o of args.objectivesServed) {
    if (!o.quotaMet && o.daysSinceLastService >= 3) {
      s.push({ type: 'objective_stalled', severity: 'passive', data: { objectiveId: o.objectiveId, name: o.name } })
    }
  }
  return s
}

/** C.4 : contrôle post-placement. */
export function postPlacementCheck(placed: number, planned: number) {
  if (placed !== planned) return { expected: planned, actual: placed, diff: planned - placed }
  return undefined
}

/** C : assemble le résultat de faisabilité. */
export function buildFeasibilityResult(args: {
  tasks: Array<{ taskId: string; title: string; deadline: string; remainingMinutes: number }>
  cumulativeCapacity: Array<{ date: string; capacityMinutes: number }>
  today: string
  anchorMissCounts: Record<string, number>
}): FeasibilityResult {
  const densities = computeDensities({
    tasks: args.tasks.map((t) => ({ taskId: t.taskId, deadline: t.deadline, remainingMinutes: t.remainingMinutes })),
    cumulativeCapacity: args.cumulativeCapacity,
    today: args.today,
  })
  const deficits = densities
    .map((d) => diagnoseDeficit(d, args.tasks.filter((t) => t.deadline <= d.deadline).map((t) => ({ title: t.title, remainingMinutes: t.remainingMinutes }))))
    .filter((x): x is NonNullable<typeof x> => x !== null)
  return {
    densities,
    globallyFeasible: densities.every((d) => d.feasible),
    deficits,
  }
}
