import type { Task, Objective, Ancre } from '@shared/schemas'

// ─── DurationRealSource (B.2 — Point 1 en attente) ────────────────────────
//
// durée_réelle = somme du temps de session OBLIGATOIRE réellement passé,
// mesuré par le mécanisme du Point 1 (blocage/session). Ce mécanisme a été
// supprimé et sera reconstruit plus tard. En attendant, le moteur utilise
// un stub qui retourne null → les facteurs par défaut (B.3) sont appliqués.

export type DurationRealSource = {
  /** Retourne la durée réelle en minutes pour une tâche, ou null si pas encore mesurée. */
  getActualMinutes: (taskId: string) => number | null
}

export const STUB_DURATION_SOURCE: DurationRealSource = {
  getActualMinutes: () => null,
}

// ─── Types de fenêtre cognitive (A.4) ─────────────────────────────────────

export type CognitiveWindow = 'PROFONDE' | 'NORMALE' | 'BASSE'

// ─── Types de créneau (slots libres entre ancres/obligations) ─────────────

export type TimeSlot = {
  startMinute: number
  endMinute: number
  durationMinutes: number
  cognitiveWindow: CognitiveWindow
}

// ─── Types de planification (Parties A-E) ─────────────────────────────────

export type DayCapacity = {
  date: string // YYYY-MM-DD
  rawCapacityMinutes: number // A.1 : 1440 − sommeil − obligations − trajets − ancres
  usableCapacityMinutes: number // A.3 : rawCapacity − fragments inutilisables − repos − fatigue
  restReservedMinutes: number // E.2 : plancher repos
  fatiguePenaltyMinutes: number // E.4 : pénalité fatigue
  slots: TimeSlot[] // créneaux libres avec qualité cognitive
}

export type TaskEstimate = {
  taskId: string
  /** Estimation utilisateur en minutes (B.1 input). */
  userEstimate: number
  /** Facteur de correction (B.1/B.3). */
  correctionFactor: number
  /** Durée planifiée = userEstimate × correctionFactor (B.1). */
  plannedDuration: number
  /** Confiance du facteur : 'low' (<5 obs), 'medium' (5-9), 'high' (≥10). */
  confidence: 'low' | 'medium' | 'high'
}

export type FeasibilityResult = {
  /** densité par deadline distincte. */
  densities: Array<{
    deadline: string
    loadMinutes: number
    capacityMinutes: number
    density: number
    feasible: boolean
  }>
  /** True si toutes les densités ≤ 1. */
  globallyFeasible: boolean
  /** Déficit chiffré si density > 1 (C.3). */
  deficits: Array<{
    deadline: string
    deficitMinutes: number
    severity: 'passive' | 'high' | 'critical'
    options: Array<{ action: string; minutesFreed: number }>
  }>
}

export type PlacedBlock = {
  id: string
  date: string
  startMinute: number
  endMinute: number
  durationMinutes: number
  kind: 'task' | 'objective' | 'ancre' | 'rest'
  refId: string
  label: string
  cognitiveWindow: CognitiveWindow
  /** Inclut le micro-repos (E.1). */
  includesBreak: boolean
  breakMinutes: number
}

export type PlanningSignal = {
  type: 'density_deficit' | 'anchor_missed_3x' | 'objective_stalled'
  severity: 'passive' | 'high' | 'critical'
  data: Record<string, unknown>
}

export type PlanningResult = {
  blocks: PlacedBlock[]
  capacities: DayCapacity[]
  feasibility: FeasibilityResult
  estimates: TaskEstimate[]
  signals: PlanningSignal[]
  /** Post-placement check (C.4) : undefined si OK, sinon bug interne. */
  internalError?: { expected: number; actual: number; diff: number }
  /** Minutes totales placées (pour C.4). */
  totalMinutesPlaced: number
  /** Minutes prévues par le plan (pour C.4). */
  totalMinutesPlanned: number
}

// ─── Input du moteur ──────────────────────────────────────────────────────

export type PlanningInput = {
  today: string // YYYY-MM-DD
  rangeEnd: string // YYYY-MM-DD (7 jours)
  tasks: Task[]
  objectives: Objective[]
  ancres: Ancre[]
  /** Ancres + obligations fixes au format TimeSlot (récupérées depuis le schedule). */
  fixedSlots: TimeSlot[]
  /** Capacité brute par jour (pré-calculée depuis le schedule par computeDayFreeMinutes). */
  dailyRawCapacity: Array<{ date: string; minutes: number }>
  /** Source de durée réelle (stub pour l'instant). */
  durationSource?: DurationRealSource
  /** Données d'apprentissage (Partie G). */
  observations: Array<{ taskId?: string; category?: string; estimatedMinutes?: number; actualMinutes?: number; startHour?: number; completed?: boolean; createdAt: string }>
  anchorMissCounts: Record<string, number>
}
