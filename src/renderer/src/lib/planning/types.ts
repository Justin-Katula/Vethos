// Types fondamentaux du moteur de planification.
// Trois types d'objets, trois lois différentes.

export type CognitiveWindow = 'PROFONDE' | 'NORMALE' | 'BASSE'

export type TimeSlot = {
  startMinute: number
  endMinute: number
  durationMinutes: number
  cognitiveWindow: CognitiveWindow
}

// ─── Objets fondamentaux ──────────────────────────────────────────────────

export type TaskItem = {
  id: string
  title: string
  deadline: string // YYYY-MM-DD
  importance: number // 1-10, déclaré une fois, jamais recalculé (C.1.1)
  category: string
  estimatedMinutes: number
  remainingMinutes: number
  correctionFactor: number
  status: 'active' | 'history'
  createdAt: string
}

export type ObjectiveItem = {
  id: string
  name: string
  description?: string
  color: string
  weeklyTargetMinutes: number // cible hebdomadaire, jamais de deadline (D.4)
  createdAt: string
}

export type AncreItem = {
  id: string
  name: string
  color: string
  trigger: string
  anchorMinute: number // 0-1439, heure fixe, ne bouge jamais (D.3)
  daysOfWeek: number[] // 0=lundi ... 6=dimanche
  normalMaxMinutes: number
  minimumMinutes: number // MAX(20, 40% × normalMax) (D.3)
  createdAt: string
}

export type ScheduleEntry = {
  dayOfWeek: number // 0=lundi ... 6=dimanche
  startMinute: number
  endMinute: number
  categoryType: 'sleep' | 'school' | 'work' | 'commitment' | 'free' | 'custom'
  label: string
  color: string
}

// ─── DurationRealSource (B.2 — Point 1 en attente) ────────────────────────

export type DurationRealSource = {
  getActualMinutes: (taskId: string) => number | null
}

export const STUB_DURATION_SOURCE: DurationRealSource = {
  getActualMinutes: () => null,
}

// ─── Résultats du moteur ──────────────────────────────────────────────────

export type DayCapacity = {
  date: string
  rawCapacityMinutes: number
  usableCapacityMinutes: number
  restReservedMinutes: number
  fatiguePenaltyMinutes: number
  slots: TimeSlot[]
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
  color: string
  cognitiveWindow: CognitiveWindow
  breakMinutes: number
}

export type FeasibilityResult = {
  densities: Array<{
    deadline: string
    loadMinutes: number
    capacityMinutes: number
    density: number
    feasible: boolean
  }>
  globallyFeasible: boolean
  deficits: Array<{
    deadline: string
    deficitMinutes: number
    severity: 'passive' | 'high' | 'critical'
    options: Array<{ action: string; minutesFreed: number }>
  }>
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
  signals: PlanningSignal[]
  totalMinutesPlaced: number
  totalMinutesPlanned: number
  internalError?: { expected: number; actual: number; diff: number }
}

// ─── Input du moteur ──────────────────────────────────────────────────────

export type PlanningInput = {
  today: string
  rangeEnd: string
  tasks: TaskItem[]
  objectives: ObjectiveItem[]
  ancres: AncreItem[]
  schedule: ScheduleEntry[]
  durationSource?: DurationRealSource
  observations: Array<{
    category?: string
    estimatedMinutes?: number
    actualMinutes?: number
    startHour?: number
    completed?: boolean
    createdAt: string
  }>
  anchorMissCounts: Record<string, number>
}
