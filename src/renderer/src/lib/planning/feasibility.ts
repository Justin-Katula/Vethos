import type {
  Deficit,
  DensityPoint,
  FeasibilityResult,
  PlanningSignal,
  SeverityLevel,
} from './types'

// ═══ PARTIE C — TEST DE FAISABILITÉ ═══════════════════════════════════════

export type MarginStatus = 'comfortable' | 'now' | 'overdue'

export type Margin = {
  marginMinutes: number
  /** Inverse de la marge — jamais un calcul séparé (C.1). */
  urgency: number
  marginStatus: MarginStatus
}

/**
 * C.1 : marge_tâche = (deadline − maintenant) − travail_restant.
 *   marge > 0 → du jeu.
 *   marge = 0 → commencer maintenant, urgence maximale.
 *   marge < 0 → PROUVÉ EN RETARD.
 * Ne s'applique jamais aux objectifs ni aux ancres.
 */
export function computeMargin(minutesUntilDeadline: number, remainingWork: number): Margin {
  const m = minutesUntilDeadline - remainingWork
  return {
    marginMinutes: m,
    urgency: m <= 0 ? Number.POSITIVE_INFINITY : 1 / m,
    marginStatus: m > 0 ? 'comfortable' : m === 0 ? 'now' : 'overdue',
  }
}

/** C.1.1 : importance déclarée une seule fois, entre 1 et 10. Jamais dérivée. */
export function validateImportance(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= 10
}

// ─── C.2 — Test de charge ─────────────────────────────────────────────────

export type DayCapacityPoint = { date: string; capacityMinutes: number }

/**
 * C.2 : pour chaque deadline distincte D —
 *   charge(D)   = Σ travail restant des tâches dont la deadline est ≤ D
 *   capacité(D) = capacité EFFECTIVE cumulée entre maintenant et D
 *   densité(D)  = charge(D) / capacité(D)
 *
 * `dailyCapacity` porte la capacité de CHAQUE jour, pas un cumul : sommer des
 * cumuls comptait la même journée plusieurs fois et déclarait faisables des
 * plans qui ne l'étaient pas.
 */
export function computeDensities(args: {
  tasks: Array<{ deadline: string; remainingMinutes: number }>
  dailyCapacity: DayCapacityPoint[]
  today: string
}): DensityPoint[] {
  const deadlines = [...new Set(args.tasks.map((t) => t.deadline))].sort()
  return deadlines.map((deadline) => {
    const load = args.tasks
      .filter((t) => t.deadline <= deadline)
      .reduce((s, t) => s + t.remainingMinutes, 0)
    const capacity = args.dailyCapacity
      .filter((c) => c.date >= args.today && c.date <= deadline)
      .reduce((s, c) => s + c.capacityMinutes, 0)
    const density = capacity > 0 ? load / capacity : load > 0 ? Number.POSITIVE_INFINITY : 0
    return {
      deadline,
      loadMinutes: load,
      capacityMinutes: capacity,
      density,
      feasible: density <= 1,
    }
  })
}

/**
 * C.3.3 : la sévérité porte UNIQUEMENT sur le déficit de densité, jamais sur
 * l'avancement d'une tâche.
 *   < 10 % du travail demandé → signal passif seulement, non actif
 *   10-30 %                   → signal passif
 *   > 30 %                    → sévérité haute
 */
export function severityFor(deficitRatio: number): SeverityLevel {
  if (deficitRatio > 0.3) return 'high'
  if (deficitRatio >= 0.1) return 'passive'
  return 'info'
}

/**
 * C.3 : diagnostic quantitatif. Toujours le déficit exact en minutes, la
 * période concernée, et au moins deux options déjà chiffrées. Jamais un statut
 * vague sans preuve.
 */
export function diagnoseDeficit(
  point: DensityPoint,
  tasks: Array<{ title: string; remainingMinutes: number }>,
): Deficit | null {
  if (point.feasible) return null

  const deficit = Math.max(0, Math.round(point.loadMinutes - point.capacityMinutes))
  const ratio = point.loadMinutes > 0 ? deficit / point.loadMinutes : 1
  const byWeight = [...tasks].sort((a, b) => b.remainingMinutes - a.remainingMinutes)
  const heaviest = byWeight[0]
  const second = byWeight[1]

  const options: Deficit['options'] = []
  if (heaviest) {
    options.push({
      action: `Repousser « ${heaviest.title} » après le ${point.deadline}`,
      minutesFreed: heaviest.remainingMinutes,
    })
    options.push({
      action: `Réduire « ${heaviest.title} » de moitié`,
      minutesFreed: Math.round(heaviest.remainingMinutes / 2),
    })
  }
  if (second) {
    options.push({ action: `Retirer « ${second.title} »`, minutesFreed: second.remainingMinutes })
  }
  if (options.length < 2) {
    options.push({
      action: `Dégager ${deficit} min de capacité avant le ${point.deadline}`,
      minutesFreed: deficit,
    })
  }

  return {
    deadline: point.deadline,
    deficitMinutes: deficit,
    deficitRatio: ratio,
    severity: severityFor(ratio),
    options,
  }
}

export function buildFeasibilityResult(args: {
  tasks: Array<{ title: string; deadline: string; remainingMinutes: number }>
  dailyCapacity: DayCapacityPoint[]
  today: string
}): FeasibilityResult {
  const densities = computeDensities(args)
  const deficits = densities
    .map((d) =>
      diagnoseDeficit(
        d,
        args.tasks.filter((t) => t.deadline <= d.deadline),
      ),
    )
    .filter((x): x is Deficit => x !== null)
  return { densities, globallyFeasible: densities.every((d) => d.feasible), deficits }
}

// ─── C.3.4 — Signaux (liste fermée) ───────────────────────────────────────

const SEVERITY_RANK: Record<SeverityLevel, number> = { info: 0, passive: 1, high: 2 }

/** F.2 : jamais deux signaux actifs sur le même sujet dans les 72 h. */
export const SIGNAL_COOLDOWN_HOURS = 72

/**
 * C.3.4 : seuls trois signaux existent — déficit de densité au-delà du seuil,
 * ancre ratée 3 fois de suite, objectif servi qui n'avance pas. Rien d'autre.
 * Aucun n'est une question posée à l'utilisateur (F).
 */
export function produceSignals(args: {
  deficits: Deficit[]
  anchorMissCounts: Record<string, number>
  objectives: Array<{
    objectiveId: string
    name: string
    quotaMet: boolean
    daysSinceLastService: number
  }>
  /** Sujet → ISO datetime du dernier signal émis. */
  lastSignalAt: Record<string, string>
  now: Date
}): PlanningSignal[] {
  const candidates: PlanningSignal[] = []

  for (const d of args.deficits) {
    // C.3.3 : sous 10 %, le signal reste passif et n'est pas remonté comme actif.
    if (d.severity === 'info') continue
    candidates.push({
      type: 'density_deficit',
      subject: `density:${d.deadline}`,
      severity: d.severity,
      data: {
        deadline: d.deadline,
        deficitMinutes: d.deficitMinutes,
        deficitRatio: d.deficitRatio,
        options: d.options,
      },
    })
  }

  for (const [ancreId, count] of Object.entries(args.anchorMissCounts)) {
    // Signal passif : aucune action automatique sur l'ancre.
    if (count >= 3) {
      candidates.push({
        type: 'anchor_missed_3x',
        subject: `anchor:${ancreId}`,
        severity: 'passive',
        data: { ancreId, missedCount: count },
      })
    }
  }

  for (const o of args.objectives) {
    if (!o.quotaMet && o.daysSinceLastService >= 3) {
      candidates.push({
        type: 'objective_stalled',
        subject: `objective:${o.objectiveId}`,
        severity: 'passive',
        data: {
          objectiveId: o.objectiveId,
          name: o.name,
          daysSinceLastService: o.daysSinceLastService,
        },
      })
    }
  }

  // F.2 : priorité au plus sévère en cas de déclenchement simultané, puis
  // silence de 72 h par sujet.
  const bySubject = new Map<string, PlanningSignal>()
  for (const c of [...candidates].sort(
    (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity],
  )) {
    if (!bySubject.has(c.subject)) bySubject.set(c.subject, c)
  }

  const cooldownMs = SIGNAL_COOLDOWN_HOURS * 3_600_000
  return [...bySubject.values()].filter((s) => {
    const last = args.lastSignalAt[s.subject]
    if (!last) return true
    const elapsed = args.now.getTime() - new Date(last).getTime()
    return Number.isNaN(elapsed) || elapsed >= cooldownMs
  })
}

/**
 * C.4 : contrôle post-placement. Les minutes réellement posées doivent égaler
 * celles que la cascade avait décidé de poser. Sinon c'est un bug interne —
 * jamais absorbé silencieusement.
 */
export function postPlacementCheck(
  placed: number,
  planned: number,
): { expected: number; actual: number; diff: number } | undefined {
  if (placed === planned) return undefined
  return { expected: planned, actual: placed, diff: planned - placed }
}
