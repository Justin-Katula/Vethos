// Types du moteur de planification.
//
// Trois types d'objets, trois lois de calcul différentes — jamais une formule
// commune :
//   TÂCHE    → deadline + quantité finie de travail, gouvernée par la MARGE.
//   OBJECTIF → jamais de deadline, gouverné par le RYTHME (cible hebdomadaire).
//   ANCRE    → heure fixe, gouvernée par la STABILITÉ.
//
// Les formes persistées vivent dans `@shared/schemas` : elles sont l'unique
// source de vérité. Le moteur n'en redéfinit aucune.

import type { Task, Objective, Ancre, ScheduleEntry, LearningObservation } from '@shared/schemas'

export type TaskItem = Task
export type ObjectiveItem = Objective
export type AncreItem = Ancre
export type { ScheduleEntry, LearningObservation }

export type CognitiveWindow = 'PROFONDE' | 'NORMALE' | 'BASSE'

/** Un intervalle libre de la journée, en minutes depuis minuit. */
export type TimeSlot = {
  startMinute: number
  endMinute: number
  durationMinutes: number
  cognitiveWindow: CognitiveWindow
}

// ─── Durée réelle (B.2) ───────────────────────────────────────────────────
//
// La durée réelle est TOUJOURS du temps de session mesuré, jamais une
// déclaration de l'utilisateur. La mesure elle-même appartient au mécanisme de
// blocage (Point 1) ; le moteur ne la lit qu'à travers cette interface.

export type DurationRealSource = {
  /** Somme des sessions obligatoires déjà mesurées pour cette tâche, ou null. */
  getActualMinutes: (taskId: string) => number | null
}

export const STUB_DURATION_SOURCE: DurationRealSource = {
  getActualMinutes: () => null,
}

// ─── Résultats ────────────────────────────────────────────────────────────

export type DayCapacity = {
  date: string
  /** 0=lundi … 6=dimanche. */
  dayOfWeek: number
  /** A.1 : 1440 − sommeil − obligations − trajets − ancres. */
  rawCapacityMinutes: number
  /** A.2 : minutes perdues en fragments trop courts + marges protégées. */
  unusableMinutes: number
  /** E.2 : repos réservé AVANT distribution, intouchable. */
  restReservedMinutes: number
  /** E.4 : pénalité de fatigue accumulée. */
  fatiguePenaltyMinutes: number
  /** E.3 : réduction imposée par la respiration hebdomadaire. */
  breathingReductionMinutes: number
  /** A.3 : le seul chiffre qui entre dans le test de faisabilité. */
  effectiveCapacityMinutes: number
  /** Créneaux réellement utilisables, ancres déjà retirées. */
  slots: TimeSlot[]
}

export type BlockKind = 'task' | 'objective' | 'ancre'

export type PlacedBlock = {
  id: string
  date: string
  startMinute: number
  endMinute: number
  /** Empreinte totale du bloc, pause comprise (E.1). */
  durationMinutes: number
  /** Pause incluse dans l'empreinte, jamais ajoutée après (E.1). */
  breakMinutes: number
  /** Minutes de travail effectif = durationMinutes − breakMinutes. */
  workMinutes: number
  kind: BlockKind
  refId: string
  label: string
  color: string
  cognitiveWindow: CognitiveWindow
  /** Vrai quand le bloc dépasse le plafond de 40 % (crise prouvée, D.5). */
  capOverride?: boolean
  /** Vrai quand l'ancre a été réduite à sa version minimale (D.3). */
  reducedToMinimum?: boolean
}

export type SeverityLevel = 'info' | 'passive' | 'high'

export type DeficitOption = {
  action: string
  minutesFreed: number
}

export type DensityPoint = {
  deadline: string
  loadMinutes: number
  capacityMinutes: number
  density: number
  feasible: boolean
}

export type Deficit = {
  deadline: string
  deficitMinutes: number
  /** Part du travail demandé qui ne rentre pas (C.3.3). */
  deficitRatio: number
  severity: SeverityLevel
  /** Toujours au moins deux options déjà chiffrées (C.3). */
  options: DeficitOption[]
}

export type FeasibilityResult = {
  densities: DensityPoint[]
  globallyFeasible: boolean
  deficits: Deficit[]
}

export type SignalType = 'density_deficit' | 'anchor_missed_3x' | 'objective_stalled'

export type PlanningSignal = {
  type: SignalType
  /** Sujet du signal — clé de l'anti-saturation 72 h (F.2). */
  subject: string
  severity: SeverityLevel
  data: Record<string, unknown>
}

/** Verdict par tâche : jamais un verdict binaire global (C.3.1). */
export type TaskVerdict = {
  taskId: string
  title: string
  neededMinutes: number
  placedMinutes: number
  status: 'placed' | 'partial' | 'unplaced'
}

export type PlanningResult = {
  blocks: PlacedBlock[]
  capacities: DayCapacity[]
  feasibility: FeasibilityResult
  signals: PlanningSignal[]
  verdicts: TaskVerdict[]
  /** Minutes de travail réellement posées dans le planning. */
  totalMinutesPlaced: number
  /** Minutes que la cascade de placement avait décidé de poser (C.4). */
  totalMinutesPlanned: number
  /** Renseigné uniquement si placé ≠ prévu — bug interne, jamais absorbé (C.4). */
  internalError?: { expected: number; actual: number; diff: number }
  /** D.6 : limite de travail en cours et encouragement (jamais un blocage dur). */
  wip: { activeCount: number; limit: number; overLimit: boolean }
  /** E.3 : bilan de la respiration hebdomadaire et jours réduits d'office. */
  breathing: {
    targetMinutes: number
    restTakenMinutes: number
    gapMinutes: number
    adjustment: 'none' | 'reduced' | 'major'
    reducedDates: string[]
    capPercent: number
  }
}

// ─── Entrée du moteur ─────────────────────────────────────────────────────

export type PlanningInput = {
  /** YYYY-MM-DD, jour de départ inclus. */
  today: string
  /** YYYY-MM-DD, dernier jour de l'horizon inclus. */
  rangeEnd: string
  tasks: TaskItem[]
  objectives: ObjectiveItem[]
  ancres: AncreItem[]
  schedule: ScheduleEntry[]
  observations: LearningObservation[]
  /** Ratés consécutifs par ancre (C.3.4). */
  anchorMissCounts: Record<string, number>
  /** Utilisation réelle par jour, mesurée (E.3/E.4). */
  dailyUtilization: Record<string, number>
  /** Minutes déjà servies par objectif cette semaine (D.4). */
  weeklyObjectiveServed: Record<string, number>
  /** Dernier jour de service par objectif (D.4). */
  objectiveLastServed: Record<string, string>
  /** Dernier signal émis par sujet — anti-saturation 72 h (F.2). */
  lastSignalAt: Record<string, string>
  /** Tâches créées par semaine, mesuré. Alimente λ du WIP (D.6). */
  tasksCreatedPerWeek: Record<string, number>
  durationSource?: DurationRealSource
}
