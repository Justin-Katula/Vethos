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

import type { Task, Objective, Ancre, ScheduleEntry, LearningObservation, SessionEvent } from '@shared/schemas'

export type TaskItem = Task
export type ObjectiveItem = Objective
export type AncreItem = Ancre
export type { ScheduleEntry, LearningObservation, SessionEvent }

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

// ─── Confirmation de session (D.7/D.8) ────────────────────────────────────
//
// Le chronomètre d'un bloc démarre à la confirmation explicite « Je commence »,
// JAMAIS à l'heure de début prévue (B.2.1). L'écart entre les deux est un
// retard, pas du travail. L'overlay de confirmation lui-même appartient au
// mécanisme de blocage (Point 1) : le moteur ne le connaît qu'à travers cette
// interface, exactement comme il ne lit la durée réelle qu'à travers
// `DurationRealSource`.

export type SessionConfirmationSource = {
  /**
   * D.7 : retard non confirmé cumulé sur `date`, en minutes —
   * Σ(T_confirmation − T0) sur les blocs du jour, sans aucune fenêtre de grâce
   * (le compteur démarre à T0 pile). Un bloc jamais confirmé compte tout son
   * temps prévu. Ne porte jamais sur un autre jour : le lendemain a ses
   * propres obligations et n'hérite jamais du retard de la veille.
   */
  getDelayMinutes: (date: string) => number
  /**
   * D.8/C.3.4 : vrai quand ce bloc n'a JAMAIS reçu de confirmation ce jour-là.
   * C'est le déclencheur concret du signal « ancre ratée » (signal 2), et le
   * fait `non_démarrée(bloc)` exposé par D.7 — jamais un jugement.
   */
  wasNeverConfirmed: (date: string, kind: BlockKind, refId: string) => boolean
}

/**
 * D.7 : la session CONFIRMÉE en cours — « Je commence » a été pressé et la
 * fenêtre n'est pas encore écoulée.
 *
 * Elle entre dans le moteur comme une contrainte de placement, au même titre
 * que la réalité fixe (D.1.1) : elle est déjà en train de se produire, donc
 * elle ne se replace pas. Sans elle, chaque recalcul (5 s) reposait le bloc en
 * cours à « maintenant » — `notBeforeMinute` (D.9) interdit le passé — et il
 * glissait indéfiniment vers l'avant.
 *
 * Défaut réel du 2026-08-23, prouvé par l'état persisté : 71 confirmations
 * enregistrées pour un même objectif, une par minute, ids `…-860`, `…-861`,
 * `…-862`… et `delayMinutes: 0` à chaque fois — un bloc qui redémarre à chaque
 * minute ne peut jamais être en retard, ni jamais aboutir.
 */
export type ActiveSession = {
  blockId: string
  kind: BlockKind
  refId: string
  /** Heure de début RÉELLE du bloc confirmé, en minutes depuis minuit. */
  startMinute: number
  endMinute: number
  /** Part de travail effectif, pause exclue (E.1). */
  workMinutes: number
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
  /** A.2 : zone de réveil protégée ce jour — 30 min, 10 en crise prouvée. */
  wakeZoneMinutes: number
  /** C.3 : minutes de zone de réveil qu'une crise prouvée a coûtées (0 ou 20). */
  wakeZoneSacrificedMinutes: number
  /** A.2.3 : buffer de retour protégé après École/Travail/Engagement/Autre — 30 min/instance, 10 en crise. */
  postObligationBufferMinutes: number
  /** C.3 : minutes de buffer de retour qu'une crise prouvée a coûtées (0 ou 20/instance). */
  postObligationSacrificedMinutes: number
  /** A.2.3 : buffer de retour après un Trajet — 5 min/instance, fixe, jamais réduit. */
  commuteBufferMinutes: number
  /** E.2 : repos réservé AVANT distribution, intouchable. */
  restReservedMinutes: number
  /** E.4 : pénalité de fatigue accumulée. */
  fatiguePenaltyMinutes: number
  /** E.4/C.3 : minutes de pénalité rendues par le plancher de crise à 60 % (0 hors crise). */
  fatigueCrisisReliefMinutes: number
  /** E.3 : réduction imposée par la respiration hebdomadaire. */
  breathingReductionMinutes: number
  /** D.7 : retard non confirmé mesuré ce jour-là, avant tout débit. */
  delayMinutes: number
  /** D.7 : part du retard absorbée par la réserve de repos du jour, sans coût de capacité. */
  delayAbsorbedByRestMinutes: number
  /** D.7/A.3 : excédent de retard qui a réellement réduit la capacité effective. */
  delayExcessMinutes: number
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
  /**
   * B.5.1 : bloc d'APERÇU — une partie encore verrouillée par une sœur
   * antérieure. Il occupe vraiment la place sur le calendrier (sinon la
   * position affichée serait un mensonge : autre chose viendrait s'y poser),
   * mais il ne déclenche NI l'overlay « Je commence », NI le blocage
   * d'applications, et son temps n'est jamais crédité comme travail fait.
   * Il montre seulement où le moteur pense que cette partie tombera.
   */
  preview?: boolean
  /**
   * D.7 : ce bloc EST la session confirmée en cours. Épinglé à son heure de
   * début réelle, jamais replacé par un recalcul — il se produit déjà.
   */
  confirmed?: boolean
  /**
   * D.7 : `non_démarrée(bloc)` — le bloc n'a jamais été confirmé de la journée.
   * Un FAIT mesuré, jamais un jugement : le moteur l'expose, il n'en tire
   * aucune conclusion et n'adresse aucun message (F).
   */
  neverConfirmed?: boolean
  /**
   * D.8 : applications que ce bloc bloque pendant qu'il est actif. Pendant ce
   * temps. Il n'existe aucune session de blocage autonome en parallèle.
   */
  appsToBlock?: string[]
  /** La clé d'apprentissage des durées : catégorie de la tâche, ou `objectif:<id>` / `ancre:<id>`. */
  category?: string
  /**
   * Pause anticipée (spec 2026-09-25) : minute, depuis le début du bloc, où
   * placer la pause parce que la personne décroche d'habitude juste après.
   */
  breakAtMinute?: number
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

/**
 * Avertissement passif (85-100 % de tension, encore faisable) — introduit à
 * côté de `Deficit` (≥100 %, déjà actif) plutôt que d'étendre `Deficit`
 * lui-même : les deux ne sont jamais vrais pour la même échéance au même
 * instant (l'une est feasible, l'autre non), mais leur sémantique diffère
 * (rien à résoudre ici, aucune option chiffrée — juste une tendance).
 */
export type TensionWarning = {
  deadline: string
  tensionRatio: number
}

export type FeasibilityResult = {
  densities: DensityPoint[]
  globallyFeasible: boolean
  deficits: Deficit[]
  tensionWarnings: TensionWarning[]
}

/**
 * C.3.4 : liste FERMÉE. Quatre signaux, pas un de plus — déficit de densité,
 * ancre ratée 3 fois, objectif servi qui n'avance pas, retard/non-démarrage
 * répété. Aucun n'est une question posée à l'utilisateur (F).
 */
export type SignalType =
  | 'density_deficit'
  | 'anchor_missed_3x'
  | 'objective_stalled'
  | 'delay_repeated'

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
  /**
   * Rampe de départ (spec 2026-09-25) : la dose de la semaine par objectif, et
   * la cible choisie. L'écart se montre comme une progression, jamais comme
   * un déficit.
   */
  objectiveDoses: Record<string, { dose: number; cible: number }>
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
  /**
   * Ratés consécutifs par ancre (C.3.4, signal 2). D.8 en fixe le déclencheur
   * concret : une ancre est « ratée » un jour donné quand sa confirmation
   * « Je commence » n'a jamais eu lieu ce jour-là.
   */
  anchorMissCounts: Record<string, number>
  /**
   * D.7/C.3.4 (signal 4) : retards ou non-démarrages consécutifs, par tâche et
   * par objectif, indexés sur leur id. Même traitement que le signal 2 —
   * passif, aucune action automatique.
   */
  consecutiveDelays: Record<string, number>
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
  /** D.7/D.8 : mesures du composant « Je commence ». Absent = aucun retard connu. */
  confirmationSource?: SessionConfirmationSource
  /**
   * D.7 : la session confirmée en cours, si elle existe. Épinglée telle quelle
   * dans le plan du jour au lieu d'être replacée — voir `ActiveSession`.
   */
  activeSession?: ActiveSession | null
  /**
   * Le journal des séances (spec 2026-09-25). Absent = aucun apprentissage :
   * la cible complète, les durées par défaut, le score sans Thompson — le
   * moteur d'avant, exactement.
   */
  sessionEvents?: SessionEvent[]
}
