/**
 * placement-engine.ts
 *
 * Moteur d'auto-placement (« Calendrier vivant », couche 1). Fonctions pures et
 * déterministes : transforment tâches/objectifs en blocs datés.
 * Réf. spec : docs/superpowers/specs/2026-05-18-vethos-auto-placement-engine-design.md
 */
import {
  OBJECTIVE_DAILY_MINUTES_BY_LEVEL,
  clampObjectiveLevel,
  type Chronotype,
  type Objective,
  type ScheduleEntry,
  type Task,
  type TimeRule,
} from '@shared/schemas'
import {
  computeFreeTimeSlots,
  estimateMinutesForLevel,
  getDeadlineMultiplier,
} from './free-time-calculator'
import type { PlacementPlanV2, ProposedPlacementBlock } from '@shared/placement-model'

// ─── Types ──────────────────────────────────────────────────────────────────

/** Un bloc concret posé sur le calendrier. */
export type PlacedBlock = {
  id: string
  date: string // YYYY-MM-DD
  startMinute: number // 0..1439
  endMinute: number // 1..1440
  kind: 'task' | 'objective' | 'break' | 'free'
  refKind: 'task' | 'objective' | 'break' | 'free'
  refId: string | null // id de la tâche/objectif ; null si 'free'
  label: string
  locked: true
  linkedTaskId: string | null // pour un objectif : tâche liée mise en avant
  linkedTaskIds: string[] // toutes les tâches actives qui contribuent au bloc
  /** Contrat Point 7 conservé jusqu'au runtime Point 8. */
  sourcePlacementBlock?: ProposedPlacementBlock
  sourcePlacementPlanV2?: PlacementPlanV2
}

/** Un item qui concourt pour le temps libre (interne au moteur). */
export type PlacementItem = {
  kind: 'task' | 'objective'
  refId: string | null
  score: number
  label: string
  /** Niveau source, utilisé pour les caps et la taille minimale de bloc. */
  level: number
  /** Échéance de la tâche (contrainte de placement) ; null pour objectif/temps libre. */
  deadline: string | null
  /** Heure exacte locale de deadline (HH:mm), si activée par l'utilisateur. */
  deadlineTime: string | null
  /** Nature de deadline pour ajuster la forme des blocs. */
  deadlineImpact: NonNullable<Task['deadlineImpact']> | null
  /** Plafond humain par jour pour cet item. */
  dailyCapMinutes: number
  /** Temps requis déclaré par l'utilisateur, si connu. */
  requiredMinutes: number | null
  /** Minutes disponibles avant l'échéance la plus contraignante, si applicable. */
  availableBeforeDeadlineMinutes: number | null
  /** Diagnostic local avant placement. */
  status: PlacementStatus
  /** Pour un objectif : tâche liée la plus urgente, mise en avant dans le bloc. */
  linkedTaskId: string | null
  /** Pour un objectif : toutes les tâches actives liées, triées par urgence. */
  linkedTaskIds: string[]
  /** Projet/catégorie macro utilisée pour limiter la variété quotidienne. */
  categoryKey?: string
  /** Travail analytique à protéger en blocs longs et fenêtre de pic cognitif. */
  isDeepWork?: boolean
  /** Budget quotidien de base d'un objectif, avant absorption de tâche. */
  objectiveBaseDailyMinutes?: number
}

export type PlacementStatus = 'planifiable' | 'risk' | 'impossible'

export type ItemBudgetBreakdown = {
  key: string
  kind: 'task' | 'objective'
  refId: string | null
  label: string
  score: number
  rawBudgetMinutes: number
  cappedMinutes: number
  placeableMinutes: number
  placedMinutes: number
  maxMeritedMinutes: number
  dailyCapMinutes: number
  minBlockMinutes: number
  requiredMinutes: number | null
  availableBeforeDeadlineMinutes: number | null
  unplannedMinutes: number
  status: PlacementStatus
}

export type PlacementDiagnostics = {
  status: PlacementStatus
  totalFreeMinutes: number
  plannedMinutes: number
  recoveryMinutes?: number
  fatigueReductionMinutes?: number
  cognitivePolicy?: CognitivePolicyStep
  relaxedRules?: string[]
  unplannedMinutes: number
  items: ItemBudgetBreakdown[]
}

export type PlacementPlan = {
  blocks: PlacedBlock[]
  diagnostics: PlacementDiagnostics
}

// ─── Utilitaires de date ────────────────────────────────────────────────────

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number) as [number, number, number]
  return new Date(y, m - 1, d)
}

function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Liste des dates YYYY-MM-DD de `startStr` à `endStr` inclus. */
export function enumerateDates(startStr: string, endStr: string): string[] {
  const end = parseLocalDate(endStr)
  const out: string[] = []
  let cursor = parseLocalDate(startStr)
  while (cursor <= end) {
    out.push(toDateStr(cursor))
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1)
  }
  return out
}

const DEFAULT_PLANNING_WINDOW_DAYS = 7
const MAX_PLANNING_WINDOW_DAYS = 366

function addDaysStr(dateStr: string, days: number): string {
  const d = parseLocalDate(dateStr)
  return toDateStr(new Date(d.getFullYear(), d.getMonth(), d.getDate() + days))
}

/** Borne une demande de planning à une fenêtre glissante explicite. */
export function clampPlanningRangeEnd(
  todayStr: string,
  rangeEndStr: string,
  maxPlanningDays = DEFAULT_PLANNING_WINDOW_DAYS,
): string {
  if (rangeEndStr < todayStr) return rangeEndStr
  const boundedDays = Math.min(
    MAX_PLANNING_WINDOW_DAYS,
    Math.max(1, Math.floor(maxPlanningDays)),
  )
  const maxEnd = addDaysStr(todayStr, boundedDays - 1)
  return rangeEndStr < maxEnd ? rangeEndStr : maxEnd
}

/** 0 = lundi … 6 = dimanche (cohérent avec le reste de l'app). */
function dayOfWeekOf(dateStr: string): number {
  return (parseLocalDate(dateStr).getDay() + 6) % 7
}

// ─── Items & score (spec §1) ────────────────────────────────────────────────

const OBJECTIVE_SCORE_DIVISOR = 1.7

const TASK_DAILY_CAP_BY_LEVEL: Record<number, number> = {
  0: 0,
  1: 15,
  2: 25,
  3: 35,
  4: 45,
  5: 60,
  6: 75,
  7: 90,
  8: 105,
  9: 120,
  10: 150,
}

const COMPLEXITY_COEFFICIENT: Record<NonNullable<Task['complexity']>, number> = {
  easy: 1,
  normal: 1.2,
  hard: 1.5,
  manual: 1,
  extreme: 2.4,
  unknown: 1.8,
}

const OBJECTIVE_MAX_DAILY_MINUTES = 240

function roundToFive(minutes: number): number {
  return Math.round(minutes / 5) * 5
}

function floorToFive(minutes: number): number {
  return Math.floor(minutes / 5) * 5
}

function ceilMinutesToFive(minutes: number): number {
  return Math.ceil(Math.max(0, minutes) / 5) * 5
}

function clampLevel(level: number): number {
  return Math.max(0, Math.min(10, Math.round(level)))
}

function daysBetweenLocalDates(fromDateStr: string, toDateStr: string): number {
  const from = parseLocalDate(fromDateStr)
  const to = parseLocalDate(toDateStr)
  return Math.round((to.getTime() - from.getTime()) / 86_400_000)
}

function parseDeadlineMinute(deadlineTime: string | null | undefined): number | null {
  if (!deadlineTime) return null
  const [hours, minutes] = deadlineTime.split(':').map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  return Math.max(0, Math.min(1440, hours! * 60 + minutes!))
}

function minutesUntilTaskDeadline(
  task: Task,
  todayStr: string,
  todayStartMinute = 0,
): number {
  const start = parseLocalDate(todayStr)
  start.setMinutes(clampMinute(todayStartMinute))
  const deadline = parseLocalDate(task.deadline)
  const deadlineMinute = parseDeadlineMinute(task.deadlineTime)
  deadline.setMinutes(deadlineMinute ?? 0)
  return Math.round((deadline.getTime() - start.getTime()) / 60_000)
}

function isInsideUrgencyWindow(task: Task, todayStr: string, todayStartMinute = 0): boolean {
  const minutesLeft = minutesUntilTaskDeadline(task, todayStr, todayStartMinute)
  return minutesLeft > 0 && minutesLeft < 48 * 60
}

function taskDeadlineImpact(task: Task): NonNullable<Task['deadlineImpact']> {
  return task.deadlineImpact ?? 'recoverable'
}

function taskComplexity(task: Task): NonNullable<Task['complexity']> {
  return task.difficulty ?? task.complexity ?? 'normal'
}

function taskComplexityCoefficient(task: Task): number {
  return COMPLEXITY_COEFFICIENT[taskComplexity(task)]
}

function taskProgressCoefficient(task: Task): number {
  const estimated = task.estimatedMinutes ?? estimateMinutesForLevel(task.level)
  const remaining = task.remainingMinutes ?? estimated
  if (estimated <= 0) return 0.3
  const progress = Math.max(0, Math.min(1, (estimated - remaining) / estimated))
  if (progress >= 0.9) return 0.3
  if (progress >= 0.75) return 0.5
  if (progress >= 0.5) return 0.7
  if (progress >= 0.25) return 0.85
  return 1
}

function taskDeadlineMultiplier(task: Task, todayStr: string, todayStartMinute = 0): number {
  const diffDays = daysBetweenLocalDates(todayStr, task.deadline)
  if (diffDays === 0 && task.deadlineTime) {
    const deadlineMinute = parseDeadlineMinute(task.deadlineTime)
    return deadlineMinute !== null && todayStartMinute < deadlineMinute ? 2 : 0
  }
  return getDeadlineMultiplier(task.deadline, todayStr, taskDeadlineImpact(task))
}

function taskScore(task: Task, todayStr: string, todayStartMinute = 0): number {
  return (
    task.level *
    taskDeadlineMultiplier(task, todayStr, todayStartMinute) *
    taskComplexityCoefficient(task) *
    taskProgressCoefficient(task)
  )
}

function taskRequiredMinutes(task: Task): number | null {
  const minutes = task.remainingMinutes ?? task.estimatedMinutes ?? estimateMinutesForLevel(task.level)
  return minutes && minutes > 0 ? minutes : null
}

function taskUrgencyCapMultiplier(task: Task, todayStr: string): number {
  const diffDays = daysBetweenLocalDates(todayStr, task.deadline)
  if (diffDays <= 1) return 1.6
  if (diffDays <= 3) return 1.35
  if (diffDays <= 7) return 1.15
  return 1
}

function taskDailyCapMinutes(task: Task, todayStr: string): number {
  const base = TASK_DAILY_CAP_BY_LEVEL[clampLevel(task.level)] ?? 0
  return roundToFive(base * taskUrgencyCapMultiplier(task, todayStr))
}

function objectiveDailyCapMinutes(objective: Objective): number {
  return OBJECTIVE_DAILY_MINUTES_BY_LEVEL[clampObjectiveLevel(objective.level)] ?? 0
}

function isDeepTask(task: Task): boolean {
  return taskComplexity(task) === 'hard'
}

function compareTasksByCurrentScore(a: Task, b: Task, todayStr: string, todayStartMinute = 0): number {
  const scoreDiff = taskScore(b, todayStr, todayStartMinute) - taskScore(a, todayStr, todayStartMinute)
  if (scoreDiff !== 0) return scoreDiff
  return b.level - a.level || a.deadline.localeCompare(b.deadline)
}

function placementStatusRank(status: PlacementStatus): number {
  if (status === 'impossible') return 2
  if (status === 'risk') return 1
  return 0
}

function worstStatus(statuses: PlacementStatus[]): PlacementStatus {
  return statuses.slice().sort((a, b) => placementStatusRank(b) - placementStatusRank(a))[0] ?? 'planifiable'
}

function emptyPlacementDiagnostics(): PlacementDiagnostics {
  return {
    status: 'planifiable',
    totalFreeMinutes: 0,
    plannedMinutes: 0,
    recoveryMinutes: 0,
    unplannedMinutes: 0,
    items: [],
  }
}

/** Clé stable d'un item. */
export function itemKey(item: PlacementItem): string {
  return `${item.kind}:${item.refId}`
}

/**
 * Construit les items en concurrence pour le temps libre :
 *  - chaque tâche autonome active de niveau > 0 ;
 *  - chaque objectif de niveau > 0 (score combiné des tâches liées / 1,7).
 */
export function buildItems(
  tasks: Task[],
  objectives: Objective[],
  todayStr: string,
  todayStartMinute = 0,
): PlacementItem[] {
  const activeTasks = tasks.filter(
    (t) => t.status === 'active' && t.level > 0 && !t.devForceDate && taskDeadlineMultiplier(t, todayStr, todayStartMinute) > 0,
  )
  const items: PlacementItem[] = []

  // Tâches autonomes (non liées à un objectif).
  for (const task of activeTasks) {
    if (task.linkedObjectiveId !== null) continue
    items.push({
      kind: 'task',
      refId: task.id,
      score: taskScore(task, todayStr, todayStartMinute),
      label: task.title,
      level: task.level,
      deadline: task.deadline,
      deadlineTime: task.deadlineTime ?? null,
      deadlineImpact: taskDeadlineImpact(task),
      dailyCapMinutes: taskDailyCapMinutes(task, todayStr),
      requiredMinutes: taskRequiredMinutes(task),
      availableBeforeDeadlineMinutes: null,
      status: 'planifiable',
      linkedTaskId: null,
      linkedTaskIds: [],
      categoryKey: `task:${task.id}`,
      isDeepWork: isDeepTask(task),
    })
  }

  // Objectifs : une seule tâche liée active nourrit la file et le score.
  for (const objective of objectives) {
    // Objectif de niveau 0 = désactivé : on le saute. Ses tâches liées — qui ne
    // sont jamais des items autonomes (cf. boucle ci-dessus) — ne reçoivent donc
    // aucun temps tant que l'objectif est à 0. Comportement voulu (spec §1).
    if (objective.status !== 'active' || objective.level <= 0) continue
    const linkedByScore = activeTasks
      .filter((t) => t.linkedObjectiveId === objective.id)
      .slice()
      .sort((a, b) => compareTasksByCurrentScore(a, b, todayStr, todayStartMinute))
    const activeLinkedTask = linkedByScore[0] ?? null
    const linkedScore = activeLinkedTask ? taskScore(activeLinkedTask, todayStr, todayStartMinute) : 0
    const linkedRequiredMinutes = activeLinkedTask ? (taskRequiredMinutes(activeLinkedTask) ?? 0) : 0
    const baseDailyMinutes = objectiveDailyCapMinutes(objective)
    const requiredMinutes = baseDailyMinutes + linkedRequiredMinutes
    items.push({
      kind: 'objective',
      refId: objective.id,
      score: (objective.level + linkedScore) / OBJECTIVE_SCORE_DIVISOR,
      label: objective.name,
      level: objective.level,
      deadline: null,
      deadlineTime: null,
      deadlineImpact: null,
      dailyCapMinutes: activeLinkedTask ? OBJECTIVE_MAX_DAILY_MINUTES : baseDailyMinutes,
      requiredMinutes: requiredMinutes > 0 ? requiredMinutes : null,
      availableBeforeDeadlineMinutes: null,
      status: 'planifiable',
      linkedTaskId: activeLinkedTask ? activeLinkedTask.id : null,
      linkedTaskIds: activeLinkedTask ? [activeLinkedTask.id] : [],
      categoryKey: `objective:${objective.id}`,
      isDeepWork: activeLinkedTask ? isDeepTask(activeLinkedTask) : false,
      objectiveBaseDailyMinutes: baseDailyMinutes,
    })
  }

  return items.filter((i) => i.score > 0)
}

// ─── Distribution du budget ────────────────────────────────────────────────

/**
 * Calcule le budget plaçable minimal par item depuis son temps restant réel.
 * Clé de map = `itemKey`.
 */
export function distributeBudget(
  items: PlacementItem[],
  dates: string[] = [],
): Map<string, number> {
  const budgets = new Map<string, number>()
  if (items.length === 0) return budgets

  for (const item of items) {
    const capped = usesObjectiveDailyCap(item)
      ? Math.min(
          Math.max(objectiveGuaranteedBudgetMinutes(item, dates), item.requiredMinutes ?? 0),
          item.dailyCapMinutes * Math.max(0, dates.length || 1),
        )
      : item.requiredMinutes ?? item.dailyCapMinutes * Math.max(0, dates.length || 1)
    budgets.set(itemKey(item), floorToFive(capped))
  }

  return budgets
}

// ─── Placement des blocs (spec §5) ──────────────────────────────────────────

const MIN_SMALL_TASK_BLOCK = 15
const MIN_LEVEL_2_TASK_BLOCK = 20
const MIN_BLOCK = 30 // durée minimale standard d'un bloc (min)
const MIN_DEEP_WORK_BLOCK = 90
const MAX_BLOCK_SIZE = 240 // durée maximale d'un bloc continu (min)
const ULTRADIAN_FOCUS_SPRINT_MINUTES = 90
const ULTRADIAN_BUFFER_MINUTES = 15
const MAX_ITEM_STREAK_BEFORE_BREAK = 240 // après 4 h sur le même item : pause obligatoire
const ITEM_BREAK_AFTER_STREAK = 60
const MAX_CATEGORIES_PER_DAY = 3
const MICRO_BATCH_DAILY_CAP = 30
const LOW_ENERGY_START_MINUTE = 15 * 60
const LOW_ENERGY_END_MINUTE = 18 * 60
const STRICT_EVENING_CURFEW_MINUTE = 21 * 60
const RELAXED_EVENING_CURFEW_MINUTE = 22 * 60
const LONG_SCHOOL_DAY_MINUTES = 6 * 60
const BASELINE_POST_SCHOOL_CAP_MINUTES = 180
const RELAXED_POST_SCHOOL_CAP_MINUTES = 240

export type CognitivePolicyStep = 'baseline' | 'curfew-22' | 'two-subjects' | 'daily-cap-240'

type CognitivePolicy = {
  step: CognitivePolicyStep
  curfewMinute: number
  maxEveningCategories: number
  postSchoolCapMinutes: number
  mandatorySubjectBufferMinutes: number
  relaxedRules: string[]
}

const COGNITIVE_POLICIES: CognitivePolicy[] = [
  {
    step: 'baseline',
    curfewMinute: STRICT_EVENING_CURFEW_MINUTE,
    maxEveningCategories: 1,
    postSchoolCapMinutes: BASELINE_POST_SCHOOL_CAP_MINUTES,
    mandatorySubjectBufferMinutes: 0,
    relaxedRules: [],
  },
  {
    step: 'curfew-22',
    curfewMinute: RELAXED_EVENING_CURFEW_MINUTE,
    maxEveningCategories: 1,
    postSchoolCapMinutes: BASELINE_POST_SCHOOL_CAP_MINUTES,
    mandatorySubjectBufferMinutes: 0,
    relaxedRules: ['curfew-22'],
  },
  {
    step: 'two-subjects',
    curfewMinute: RELAXED_EVENING_CURFEW_MINUTE,
    maxEveningCategories: 2,
    postSchoolCapMinutes: BASELINE_POST_SCHOOL_CAP_MINUTES,
    mandatorySubjectBufferMinutes: ULTRADIAN_BUFFER_MINUTES,
    relaxedRules: ['curfew-22', 'two-subjects'],
  },
  {
    step: 'daily-cap-240',
    curfewMinute: RELAXED_EVENING_CURFEW_MINUTE,
    maxEveningCategories: 2,
    postSchoolCapMinutes: RELAXED_POST_SCHOOL_CAP_MINUTES,
    mandatorySubjectBufferMinutes: ULTRADIAN_BUFFER_MINUTES,
    relaxedRules: ['curfew-22', 'two-subjects', 'daily-cap-240'],
  },
]

function itemMinBlockMinutes(item: PlacementItem): number {
  if (isDeepWorkItem(item)) return MIN_DEEP_WORK_BLOCK
  if (item.kind === 'objective') return MIN_BLOCK
  const level = clampLevel(item.level)
  if (level <= 1) return MIN_SMALL_TASK_BLOCK
  if (level === 2) return MIN_LEVEL_2_TASK_BLOCK
  return MIN_BLOCK
}

function isSmallItem(item: PlacementItem): boolean {
  return item.kind === 'task' && clampLevel(item.level) <= 2
}

function isDeepWorkItem(item: PlacementItem): boolean {
  return item.isDeepWork === true
}

function isMicroTaskItem(item: PlacementItem): boolean {
  return item.kind === 'task' && !isDeepWorkItem(item) && (isSmallItem(item) || item.requiredMinutes !== null && item.requiredMinutes <= 30)
}

function itemCategoryKey(item: PlacementItem, fallbackKey: string): string {
  if (isMicroTaskItem(item)) return 'micro-tasks'
  return item.categoryKey ?? fallbackKey
}

function isHardNearDeadline(item: PlacementItem, todayStr?: string): boolean {
  if (item.kind !== 'task' || item.deadlineImpact !== 'hard') {
    return false
  }
  if (!item.deadline) return true
  if (!todayStr) return false
  return daysBetweenLocalDates(todayStr, item.deadline) <= 3
}

function usesObjectiveDailyCap(item: PlacementItem): boolean {
  return item.kind === 'objective'
}

function objectiveGuaranteedBudgetMinutes(item: PlacementItem, dates: string[]): number {
  if (!usesObjectiveDailyCap(item)) return 0
  const eligibleDays = dates.length ? eligibleDatesForItem(item, dates).length : 1
  const baseDailyMinutes = item.objectiveBaseDailyMinutes ?? item.dailyCapMinutes
  return baseDailyMinutes * Math.max(0, eligibleDays)
}

function isUrgentTaskItem(item: PlacementItem, todayStr?: string): boolean {
  if (item.kind !== 'task' || !item.deadline || !todayStr) return false
  const daysUntilDeadline = daysBetweenLocalDates(todayStr, item.deadline)
  if (daysUntilDeadline < 0) return false
  if (daysUntilDeadline === 0 && item.deadlineTime) return true
  return daysUntilDeadline <= 7
}

function placementPriorityRank(item: PlacementItem, todayStr?: string): number {
  if (isDeepWorkItem(item)) return 0
  if (isUrgentTaskItem(item, todayStr)) return 1
  if (item.kind === 'objective') return 2
  return 3
}

function preferredMaxBlockMinutes(item: PlacementItem, todayStr?: string): number {
  if (isDeepWorkItem(item)) return MAX_BLOCK_SIZE
  if (isSmallItem(item)) return Math.max(itemMinBlockMinutes(item), item.dailyCapMinutes)
  if (item.kind === 'objective') return Math.min(MAX_BLOCK_SIZE, Math.max(MIN_BLOCK, item.dailyCapMinutes))
  // Une deadline critique autorise plusieurs sprints le même jour, jamais un
  // bloc continu de plusieurs heures. Les pauses ultradiennes restent donc
  // réservées entre les sprints au lieu d'être repoussées après le travail.
  if (isHardNearDeadline(item, todayStr)) return ULTRADIAN_FOCUS_SPRINT_MINUTES
  return 90
}

function chooseBlockSize(
  item: PlacementItem,
  budget: number,
  capacity: number,
  todayStr?: string,
): number {
  const minBlock = itemMinBlockMinutes(item)
  const maxBlock = Math.max(minBlock, Math.min(MAX_BLOCK_SIZE, preferredMaxBlockMinutes(item, todayStr)))
  const usable = floorToFive(Math.min(budget, capacity))
  if (usable < minBlock) return 0
  if (usable <= maxBlock) return usable

  const blockCount = Math.ceil(usable / maxBlock)
  const target = floorToFive(usable / blockCount)
  return Math.max(minBlock, Math.min(maxBlock, target))
}

type WorkSlot = { cursor: number; endMinute: number }

type ItemStreakState = {
  streakMinutes: number
  lastEndMinute: number
}

type PlacementWindowOptions = {
  todayStr?: string
  todayStartMinute?: number
  wakeMinute?: number | null
  morningBufferMinutes?: number
  chronotype?: Chronotype
  peakAlertnessHour?: number | null
  includeRecoveryBlocks?: boolean
  cognitivePolicy?: CognitivePolicy
  fatigueRecoveryDate?: string | null
  fatigueRecoveryMinutes?: number
}

function clampMinute(minute: number): number {
  if (!Number.isFinite(minute)) return 0
  return Math.max(0, Math.min(1440, Math.floor(minute)))
}

function ceilToFive(minute: number): number {
  return Math.min(1440, Math.ceil(clampMinute(minute) / 5) * 5)
}

function reduceLatestSlotCapacity(slots: WorkSlot[], reductionMinutes: number): WorkSlot[] {
  let remaining = floorToFive(Math.max(0, reductionMinutes))
  if (remaining <= 0) return slots

  const reduced = slots.map((slot) => ({ ...slot }))
  for (let i = reduced.length - 1; i >= 0 && remaining > 0; i -= 1) {
    const slot = reduced[i]!
    const duration = Math.max(0, slot.endMinute - slot.cursor)
    const consumed = Math.min(duration, remaining)
    slot.endMinute -= consumed
    remaining -= consumed
  }
  return reduced.filter((slot) => slot.endMinute - slot.cursor >= MIN_SMALL_TASK_BLOCK)
}

function peakWindowForOptions(options: PlacementWindowOptions): { startMinute: number; endMinute: number } | null {
  if (options.peakAlertnessHour !== null && options.peakAlertnessHour !== undefined) {
    const peakMinute = clampMinute(options.peakAlertnessHour * 60)
    return {
      startMinute: clampMinute(peakMinute - 60),
      endMinute: Math.min(1440, peakMinute + 120),
    }
  }
  if (options.wakeMinute === null || options.wakeMinute === undefined) return null
  const offsetByChronotype: Record<Chronotype, number> = {
    morning: 90,
    intermediate: 120,
    evening: 180,
  }
  const startMinute = clampMinute(
    options.wakeMinute + (offsetByChronotype[options.chronotype ?? 'intermediate'] ?? 120),
  )
  return {
    startMinute,
    endMinute: Math.min(1440, startMinute + 180),
  }
}

type PlacementSearchWindow = { startMinute: number; endMinute: number } | null

function preferredSearchWindows(item: PlacementItem, options: PlacementWindowOptions): PlacementSearchWindow[] {
  if (isDeepWorkItem(item)) {
    const peak = peakWindowForOptions(options)
    return peak ? [peak, null] : [null]
  }
  if (isMicroTaskItem(item)) {
    return [
      { startMinute: LOW_ENERGY_START_MINUTE, endMinute: LOW_ENERGY_END_MINUTE },
      { startMinute: LOW_ENERGY_START_MINUTE, endMinute: 1440 },
    ]
  }
  return [null]
}

function reserveSlotTime(slots: WorkSlot[], slot: WorkSlot, startMinute: number, endMinute: number): void {
  const originalCursor = slot.cursor
  if (originalCursor < startMinute) {
    slots.push({ cursor: originalCursor, endMinute: startMinute })
  }
  slot.cursor = endMinute
  slots.sort((a, b) => a.cursor - b.cursor || a.endMinute - b.endMinute)
}

function canReserveRecoveryBuffer(slot: WorkSlot, blockEnd: number, minutes = ULTRADIAN_BUFFER_MINUTES): boolean {
  return slot.endMinute - blockEnd >= minutes
}

function recoveryBlockFor(args: {
  date: string
  startMinute: number
  sourceId: string
  minutes?: number
  label?: string
}): PlacedBlock {
  const minutes = args.minutes ?? ULTRADIAN_BUFFER_MINUTES
  return {
    id: `${args.date}:${args.startMinute}:break:${args.sourceId}`,
    date: args.date,
    startMinute: args.startMinute,
    endMinute: args.startMinute + minutes,
    kind: 'break',
    refKind: 'break',
    refId: null,
    label: args.label ?? 'Récupération',
    locked: true,
    linkedTaskId: null,
    linkedTaskIds: [],
  }
}

function hasSchedulableWorkAfterRecovery(args: {
  placeable: PlacementItem[]
  currentIndex: number
  budgets: Map<string, number>
  currentBudgetAfterBlock: number
  currentBlockSize: number
  date: string
  recoveryEnd: number
  slots: WorkSlot[]
  dayCapacityByItem: Map<string, Map<string, number>>
  perDayItem: Map<string, number>
}): boolean {
  const {
    placeable,
    currentIndex,
    budgets,
    currentBudgetAfterBlock,
    currentBlockSize,
    date,
    recoveryEnd,
    slots,
    dayCapacityByItem,
    perDayItem,
  } = args

  for (let index = currentIndex; index < placeable.length; index += 1) {
    const candidate = placeable[index]!
    const candidateKey = itemKey(candidate)
    const minBlock = itemMinBlockMinutes(candidate)
    const remainingBudget =
      index === currentIndex ? currentBudgetAfterBlock : budgets.get(candidateKey) ?? 0
    if (remainingBudget < minBlock) continue
    if (!eligibleDatesForItem(candidate, [date]).includes(date)) continue

    const alreadyPlaced = perDayItem.get(`${date}|${candidateKey}`) ?? 0
    const effectivePlaced = alreadyPlaced + (index === currentIndex ? currentBlockSize : 0)
    const dayCapacity = dayCapacityByItem.get(candidateKey)?.get(date) ?? 0
    if (dayCapacity - effectivePlaced < minBlock) continue

    const hasSlotAfterRecovery = slots.some((slot) => {
      const startMinute = Math.max(slot.cursor, recoveryEnd)
      const endMinute = effectiveSlotEndForItem(candidate, date, slot)
      return endMinute - startMinute >= minBlock
    })
    if (hasSlotAfterRecovery) return true
  }

  return false
}

function dropRecoveryBlocksWithoutFollowingWork(blocks: PlacedBlock[]): PlacedBlock[] {
  return blocks.filter((block) => {
    if (block.kind !== 'break') return true
    return blocks.some(
      (candidate) =>
        (candidate.kind === 'task' || candidate.kind === 'objective') &&
        candidate.date === block.date &&
        candidate.startMinute >= block.endMinute,
    )
  })
}

export function consolidatedMajorPauseMinutes(shortBuffersTaken: number): number {
  return Math.max(0, ITEM_BREAK_AFTER_STREAK - Math.max(0, Math.round(shortBuffersTaken)))
}

function cognitivePolicy(options: PlacementWindowOptions): CognitivePolicy {
  return options.cognitivePolicy ?? COGNITIVE_POLICIES[0]!
}

function isSchoolRule(rule: TimeRule): boolean {
  if (rule.categoryType) return rule.categoryType === 'school'
  const name = rule.name.toLowerCase()
  return (
    name.includes('école') ||
    name.includes('ecole') ||
    name.includes('school') ||
    name.includes('cours') ||
    name.includes('class')
  )
}

function longSchoolEndMinuteForDate(
  date: string,
  entries: ScheduleEntry[],
  rules: TimeRule[],
): number | null {
  const day = dayOfWeekOf(date)
  const ruleById = new Map(rules.map((rule) => [rule.id, rule]))
  let endMinute: number | null = null
  for (const entry of entries) {
    if (entry.dayOfWeek !== day) continue
    const rule = ruleById.get(entry.ruleId)
    if (!rule || !isSchoolRule(rule)) continue
    if (entry.endMinute - entry.startMinute < LONG_SCHOOL_DAY_MINUTES) continue
    endMinute = Math.max(endMinute ?? 0, entry.endMinute)
  }
  return endMinute
}

function eveningStartMinuteForDate(
  date: string,
  entries: ScheduleEntry[],
  rules: TimeRule[],
): number {
  return longSchoolEndMinuteForDate(date, entries, rules) ?? LOW_ENERGY_START_MINUTE
}

function workSlotsForDate(
  date: string,
  entries: ScheduleEntry[],
  rules: TimeRule[],
  options: PlacementWindowOptions = {},
): WorkSlot[] {
  const firstMinute = date === options.todayStr ? ceilToFive(options.todayStartMinute ?? 0) : 0
  const curfewMinute = cognitivePolicy(options).curfewMinute
  const slots = computeFreeTimeSlots(dayOfWeekOf(date), entries, rules, {
    wakeMinute: options.wakeMinute,
    morningBufferMinutes: options.morningBufferMinutes ?? 30,
  })
    .filter((s) => !s.isPreparation)
    .map((s) => ({
      cursor: Math.max(s.startMinute, firstMinute),
      endMinute: Math.min(s.endMinute, curfewMinute),
    }))
    .filter((s) => s.endMinute - s.cursor >= MIN_SMALL_TASK_BLOCK)
  if (options.fatigueRecoveryDate === date && options.fatigueRecoveryMinutes) {
    return reduceLatestSlotCapacity(slots, options.fatigueRecoveryMinutes)
  }
  return slots
}

function eligibleDatesForItem(item: PlacementItem, dates: string[]): string[] {
  if (item.kind !== 'task' || item.deadline === null) return dates
  return dates.filter((date) => {
    if (date > item.deadline!) return false
    if (!item.deadlineTime) return date < item.deadline!
    return true
  })
}

function minutesInSlots(slots: WorkSlot[]): number {
  return slots.reduce((sum, slot) => sum + (slot.endMinute - slot.cursor), 0)
}

function itemStreakAtStart(state: ItemStreakState | undefined, startMinute: number): number {
  if (!state) return 0
  if (startMinute >= state.lastEndMinute + ITEM_BREAK_AFTER_STREAK) return 0
  return state.streakMinutes
}

function nextStartRespectingItemBreak(
  state: ItemStreakState | undefined,
  cursor: number,
): number {
  if (!state) return cursor
  const startAfterPreviousBlock = Math.max(cursor, state.lastEndMinute)
  if (startAfterPreviousBlock >= state.lastEndMinute + ITEM_BREAK_AFTER_STREAK) {
    return startAfterPreviousBlock
  }
  if (state.streakMinutes >= MAX_ITEM_STREAK_BEFORE_BREAK) {
    return state.lastEndMinute + ITEM_BREAK_AFTER_STREAK
  }
  return startAfterPreviousBlock
}

function remainingItemStreakCapacity(
  state: ItemStreakState | undefined,
  startMinute: number,
): number {
  const streak = itemStreakAtStart(state, startMinute)
  return Math.max(0, MAX_ITEM_STREAK_BEFORE_BREAK - streak)
}

function nextItemStreakState(
  previous: ItemStreakState | undefined,
  startMinute: number,
  size: number,
): ItemStreakState {
  const streak = itemStreakAtStart(previous, startMinute)
  return {
    streakMinutes: Math.min(MAX_ITEM_STREAK_BEFORE_BREAK, streak + size),
    lastEndMinute: startMinute + size,
  }
}

function itemBreakAwareSlotStart(
  state: ItemStreakState | undefined,
  slot: WorkSlot,
  slotEnd: number,
  minBlock: number,
): number | null {
  let start = nextStartRespectingItemBreak(state, slot.cursor)
  if (start < slot.cursor) start = slot.cursor
  if (slotEnd - start < minBlock) return null
  if (remainingItemStreakCapacity(state, start) < minBlock) {
    start = state ? state.lastEndMinute + ITEM_BREAK_AFTER_STREAK : start
  }
  return slotEnd - start >= minBlock ? start : null
}

function findPlacementSlot(args: {
  item: PlacementItem
  slots: WorkSlot[]
  date: string
  streak: ItemStreakState | undefined
  minBlock: number
  options: PlacementWindowOptions
}): { slot: WorkSlot; blockStart: number; effectiveEnd: number } | null {
  const { item, slots, date, streak, minBlock, options } = args

  for (const window of preferredSearchWindows(item, options)) {
    for (const slot of slots) {
      const slotEnd = effectiveSlotEndForItem(item, date, slot)
      const windowStart = window ? window.startMinute : 0
      const windowEnd = window ? window.endMinute : 1440
      const effectiveStart = Math.max(slot.cursor, windowStart)
      const effectiveEnd = Math.min(slotEnd, windowEnd)
      if (effectiveEnd - effectiveStart < minBlock) continue
      const start = itemBreakAwareSlotStart(
        streak,
        { cursor: effectiveStart, endMinute: effectiveEnd },
        effectiveEnd,
        minBlock,
      )
      if (start === null) continue
      return { slot, blockStart: start, effectiveEnd }
    }
  }

  return null
}

function maxMinutesWithItemBreaks(slots: Array<{ startMinute: number; endMinute: number }>, minBlock: number): number {
  let total = 0
  let state: ItemStreakState | undefined

  for (const slot of slots) {
    let cursor = slot.startMinute
    const slotEnd = slot.endMinute
    let guard = 0
    while (slotEnd - cursor >= minBlock && guard < 100) {
      guard += 1
      const start = itemBreakAwareSlotStart(state, { cursor, endMinute: slotEnd }, slotEnd, minBlock)
      if (start === null) break
      const streakCapacity = remainingItemStreakCapacity(state, start)
      const size = floorToFive(Math.min(slotEnd - start, streakCapacity))
      if (size < minBlock) break
      total += size
      state = nextItemStreakState(state, start, size)
      cursor = start + size
    }
  }

  return total
}

function selectEvenly<T>(values: T[], count: number): T[] {
  if (count <= 0 || values.length === 0) return []
  if (count >= values.length) return values.slice()
  if (count === 1) return [values[0]!]

  const selected: T[] = []
  const used = new Set<number>()
  for (let i = 0; i < count; i += 1) {
    let index = Math.round((i * (values.length - 1)) / (count - 1))
    while (used.has(index) && index < values.length - 1) index += 1
    while (used.has(index) && index > 0) index -= 1
    used.add(index)
    selected.push(values[index]!)
  }
  return selected.sort((a, b) => values.indexOf(a) - values.indexOf(b))
}

function fairTargetForDate(
  item: PlacementItem,
  key: string,
  date: string,
  budget: number,
  eligible: string[],
  perDayItem: Map<string, number>,
  dayCapacityByDate: Map<string, number>,
): number {
  const minBlock = itemMinBlockMinutes(item)
  const itemDayCap = dayCapacityByDate.get(date) ?? 0
  if (budget < minBlock || itemDayCap < minBlock) return 0
  const alreadyForDate = perDayItem.get(`${date}|${key}`) ?? 0
  const budgetIncludingCurrentDay = budget + alreadyForDate

  const futureDates = eligible.filter((candidate) => {
    if (candidate < date) return false
    const candidateCap = dayCapacityByDate.get(candidate) ?? 0
    return (perDayItem.get(`${candidate}|${key}`) ?? 0) < candidateCap
  })
  if (futureDates.length === 0) return 0

  const maxDaysByMinBlock = Math.max(1, Math.floor(budgetIncludingCurrentDay / minBlock))
  const largestFutureDayCap = Math.max(...futureDates.map((candidate) => dayCapacityByDate.get(candidate) ?? 0))
  const minDaysByCap = Math.max(1, Math.ceil(budgetIncludingCurrentDay / Math.max(minBlock, largestFutureDayCap)))
  const targetDayCount = Math.min(
    futureDates.length,
    Math.max(minDaysByCap, Math.min(futureDates.length, maxDaysByMinBlock)),
  )
  const targetDates = selectEvenly(futureDates, targetDayCount)
  const index = targetDates.indexOf(date)
  if (index === -1) return 0

  const daysLeft = targetDates.length - index
  const minimumForLaterDays = minBlock * Math.max(0, daysLeft - 1)
  const maximumTodayWithoutStarvingLater = Math.max(
    0,
    budgetIncludingCurrentDay - minimumForLaterDays,
  )
  const averageTarget =
    daysLeft === 1 ? budgetIncludingCurrentDay : floorToFive(budgetIncludingCurrentDay / daysLeft)
  const target = Math.min(
    itemDayCap,
    maximumTodayWithoutStarvingLater,
    Math.max(minBlock, averageTarget),
  )
  return floorToFive(target)
}

function effectiveSlotEndForItem(item: PlacementItem, date: string, slot: WorkSlot): number {
  if (item.kind !== 'task' || !item.deadlineTime || item.deadline !== date) return slot.endMinute
  const deadlineMinute = parseDeadlineMinute(item.deadlineTime)
  if (deadlineMinute === null) return slot.endMinute
  return Math.min(slot.endMinute, deadlineMinute)
}

function itemPlaceableMinutes(
  item: PlacementItem,
  dates: string[],
  slotsByDate: Map<string, WorkSlot[]>,
): number {
  const minBlock = itemMinBlockMinutes(item)
  return eligibleDatesForItem(item, dates).reduce((sum, date) => {
    const slots = (slotsByDate.get(date) ?? [])
      .map((slot) => ({
        startMinute: slot.cursor,
        endMinute: effectiveSlotEndForItem(item, date, slot),
      }))
      .filter((slot) => slot.endMinute - slot.startMinute >= minBlock)
    const dayCapacity = maxMinutesWithItemBreaks(slots, minBlock)
    const dayPlaceable = floorToFive(
      usesObjectiveDailyCap(item)
        ? Math.min(dayCapacity, item.dailyCapMinutes)
        : dayCapacity,
    )
    return sum + (dayPlaceable >= minBlock ? dayPlaceable : 0)
  }, 0)
}

function availableBeforeDeadline(
  deadline: string,
  deadlineTime: string | null,
  todayStr: string,
  dates: string[],
  slotsByDate: Map<string, WorkSlot[]>,
): number {
  if (deadline < todayStr) return 0
  return dates
    .filter((date) => (deadlineTime ? date <= deadline : date < deadline))
    .reduce((sum, date) => {
      if (date !== deadline || !deadlineTime) return sum + minutesInSlots(slotsByDate.get(date) ?? [])
      const deadlineMinute = parseDeadlineMinute(deadlineTime)
      if (deadlineMinute === null) return sum + minutesInSlots(slotsByDate.get(date) ?? [])
      return (
        sum +
        (slotsByDate.get(date) ?? []).reduce(
          (slotSum, slot) => slotSum + Math.max(0, Math.min(slot.endMinute, deadlineMinute) - slot.cursor),
          0,
        )
      )
    }, 0)
}

function itemPlaceableBeforeDeadline(
  item: PlacementItem,
  deadline: string,
  todayStr: string,
  dates: string[],
  slotsByDate: Map<string, WorkSlot[]>,
): number {
  if (deadline < todayStr) return 0
  return itemPlaceableMinutes(
    item,
    dates.filter((date) => date <= deadline),
    slotsByDate,
  )
}

function totalTaskDistributionDays(task: Task, todayStr: string, todayStartMinute = 0): number {
  const diffDays = daysBetweenLocalDates(todayStr, task.deadline)
  if (diffDays < 0) return 0
  if (diffDays === 0 && task.deadlineTime) {
    const deadlineMinute = parseDeadlineMinute(task.deadlineTime)
    return deadlineMinute !== null && todayStartMinute < deadlineMinute ? 1 : 0
  }
  if (!task.deadlineTime) return Math.max(0, diffDays)
  return diffDays + 1
}

function taskWindowBudgetMinutes(
  task: Task,
  item: PlacementItem,
  dates: string[],
  todayStr: string,
  todayStartMinute = 0,
): number {
  const required = taskRequiredMinutes(task)
  if (required === null) return 0
  const eligibleWindowDays = eligibleDatesForItem(item, dates).length
  if (eligibleWindowDays <= 0) return 0
  const totalDays = totalTaskDistributionDays(task, todayStr, todayStartMinute)
  if (totalDays <= 0) return 0
  if (isInsideUrgencyWindow(task, todayStr, todayStartMinute)) return required
  const dailyNeed = ceilMinutesToFive(required / totalDays)
  return Math.min(required, dailyNeed * eligibleWindowDays)
}

function objectiveWindowBudgetMinutes(
  item: PlacementItem,
  tasksById: Map<string, Task>,
  dates: string[],
  todayStr: string,
  todayStartMinute = 0,
): number {
  const baseBudget = objectiveGuaranteedBudgetMinutes(item, dates)
  if (!item.linkedTaskId) return baseBudget
  const activeTask = tasksById.get(item.linkedTaskId)
  if (!activeTask) return baseBudget
  const taskItem: PlacementItem = {
    ...item,
    kind: 'task',
    refId: activeTask.id,
    deadline: activeTask.deadline,
    deadlineTime: activeTask.deadlineTime ?? null,
    deadlineImpact: taskDeadlineImpact(activeTask),
    dailyCapMinutes: OBJECTIVE_MAX_DAILY_MINUTES,
    requiredMinutes: taskRequiredMinutes(activeTask),
  }
  return baseBudget + taskWindowBudgetMinutes(activeTask, taskItem, dates, todayStr, todayStartMinute)
}

function itemWindowBudgetMinutes(
  item: PlacementItem,
  tasksById: Map<string, Task>,
  dates: string[],
  todayStr: string,
  todayStartMinute = 0,
): number {
  if (item.kind === 'task' && item.refId) {
    const task = tasksById.get(item.refId)
    return task ? taskWindowBudgetMinutes(task, item, dates, todayStr, todayStartMinute) : 0
  }
  if (item.kind === 'objective') {
    return objectiveWindowBudgetMinutes(item, tasksById, dates, todayStr, todayStartMinute)
  }
  return item.requiredMinutes ?? 0
}

function taskConstraintStatus(
  task: Task,
  todayStr: string,
  dates: string[],
  slotsByDate: Map<string, WorkSlot[]>,
  item?: PlacementItem,
): { status: PlacementStatus; requiredMinutes: number | null; availableMinutes: number | null } {
  const requiredMinutes = taskRequiredMinutes(task)
  const availableMinutes = item
    ? itemPlaceableBeforeDeadline(item, task.deadline, todayStr, dates, slotsByDate)
    : availableBeforeDeadline(task.deadline, task.deadlineTime ?? null, todayStr, dates, slotsByDate)
  const windowEndStr = dates[dates.length - 1] ?? todayStr
  const requiredForWindow =
    item && task.deadline > windowEndStr
      ? taskWindowBudgetMinutes(task, item, dates, todayStr)
      : requiredMinutes
  if (task.deadline < todayStr) {
    return { status: 'impossible', requiredMinutes, availableMinutes }
  }
  if (requiredForWindow === null || requiredForWindow <= 0) {
    return { status: 'planifiable', requiredMinutes, availableMinutes }
  }
  if (availableMinutes < requiredForWindow) {
    return { status: 'impossible', requiredMinutes, availableMinutes }
  }
  if (availableMinutes * 0.8 < requiredForWindow) {
    return { status: 'risk', requiredMinutes, availableMinutes }
  }
  return { status: 'planifiable', requiredMinutes, availableMinutes }
}

function itemConstraintStatus(
  item: PlacementItem,
  tasksById: Map<string, Task>,
  todayStr: string,
  dates: string[],
  slotsByDate: Map<string, WorkSlot[]>,
): { status: PlacementStatus; requiredMinutes: number | null; availableMinutes: number | null } {
  if (item.kind === 'objective') {
    const requiredMinutes = itemWindowBudgetMinutes(item, tasksById, dates, todayStr)
    const availableMinutes = itemPlaceableMinutes(item, dates, slotsByDate)
    return {
      status: item.status,
      requiredMinutes: requiredMinutes > 0 ? requiredMinutes : null,
      availableMinutes,
    }
  }

  if (item.kind === 'task' && item.refId) {
    const task = tasksById.get(item.refId)
    if (task) return taskConstraintStatus(task, todayStr, dates, slotsByDate, item)
  }

  return {
    status: item.status,
    requiredMinutes: item.requiredMinutes,
    availableMinutes: item.availableBeforeDeadlineMinutes,
  }
}

function computeBudgetBreakdowns(args: {
  items: PlacementItem[]
  dates: string[]
  tasks: Task[]
  todayStr: string
  todayStartMinute?: number
  slotsByDate: Map<string, WorkSlot[]>
}): { budgets: Map<string, number>; breakdowns: ItemBudgetBreakdown[] } {
  const { items, dates, tasks, todayStr, todayStartMinute = 0, slotsByDate } = args
  const budgets = new Map<string, number>()
  const tasksById = new Map(tasks.map((task) => [task.id, task]))

  if (items.length === 0) {
    return { budgets, breakdowns: [] }
  }

  const breakdowns = items.map((item) => {
    const key = itemKey(item)
    const rawBudgetMinutes = itemWindowBudgetMinutes(item, tasksById, dates, todayStr, todayStartMinute)
    const maxMeritedMinutes = usesObjectiveDailyCap(item)
      ? item.dailyCapMinutes * eligibleDatesForItem(item, dates).length
      : rawBudgetMinutes
    const constraint = itemConstraintStatus(item, tasksById, todayStr, dates, slotsByDate)
    const requiredLimit = constraint.requiredMinutes ?? rawBudgetMinutes
    const cappedMinutes = floorToFive(
      Math.min(rawBudgetMinutes, maxMeritedMinutes, requiredLimit),
    )
    const placeableMinutes = Math.min(cappedMinutes, itemPlaceableMinutes(item, dates, slotsByDate))
    budgets.set(key, placeableMinutes)
    return {
      key,
      kind: item.kind,
      refId: item.refId,
      label: item.label,
      score: item.score,
      rawBudgetMinutes: roundToFive(rawBudgetMinutes),
      cappedMinutes,
      placeableMinutes,
      placedMinutes: 0,
      maxMeritedMinutes,
      dailyCapMinutes: item.dailyCapMinutes,
      minBlockMinutes: itemMinBlockMinutes(item),
      requiredMinutes: constraint.requiredMinutes,
      availableBeforeDeadlineMinutes: constraint.availableMinutes,
      unplannedMinutes: cappedMinutes,
      status: constraint.status,
    }
  })

  return { budgets, breakdowns }
}

/**
 * Place les budgets (tâches + objectifs) en blocs concrets. Le temps libre
 * n'est pas placé : ce sont les créneaux qui restent vides. Par item, le budget
 * est étalé sur ses jours éligibles ; les tâches ne dépassent jamais leur
 * échéance ; les plafonds par jour sont respectés.
 */
export function placeBlocks(
  items: PlacementItem[],
  budgets: Map<string, number>,
  dates: string[],
  entries: ScheduleEntry[],
  rules: TimeRule[],
  options: PlacementWindowOptions = {},
): PlacedBlock[] {
  const placeable = items.slice().sort((a, b) => {
    const rankDiff = placementPriorityRank(a, options.todayStr) - placementPriorityRank(b, options.todayStr)
    if (rankDiff !== 0) return rankDiff
    return b.score - a.score
  })

  // Créneaux de travail libres par date (créneaux non-préparation ≥ plus petit bloc).
  const slotsByDate = new Map<string, WorkSlot[]>()
  for (const date of dates) {
    slotsByDate.set(date, workSlotsForDate(date, entries, rules, options))
  }

  const perDayItem = new Map<string, number>() // clé `${date}|${itemKey}`
  const perDayItemStreak = new Map<string, ItemStreakState>() // clé `${date}|${itemKey}`
  const perDayCategories = new Map<string, Set<string>>()
  const perDayMicroMinutes = new Map<string, number>()
  const perDayPostSchoolMinutes = new Map<string, number>()
  const perDayEveningCategories = new Map<string, Set<string>>()
  const perDayLastEveningEnd = new Map<string, number>()
  const perDayCycleWorkMinutes = new Map<string, number>()
  const perDayCycleShortBreakMinutes = new Map<string, number>()
  const blocks: PlacedBlock[] = []
  const policy = cognitivePolicy(options)
  const longSchoolEndByDate = new Map<string, number | null>()
  const eveningStartByDate = new Map<string, number>()

  for (const date of dates) {
    longSchoolEndByDate.set(date, longSchoolEndMinuteForDate(date, entries, rules))
    eveningStartByDate.set(date, eveningStartMinuteForDate(date, entries, rules))
  }

  const dayCapacityByItem = new Map<string, Map<string, number>>()
  for (const item of placeable) {
    const key = itemKey(item)
    const minBlock = itemMinBlockMinutes(item)
    const capacityByDate = new Map<string, number>()
    for (const date of eligibleDatesForItem(item, dates)) {
      const slots = (slotsByDate.get(date) ?? [])
        .map((slot) => ({
          startMinute: slot.cursor,
          endMinute: effectiveSlotEndForItem(item, date, slot),
        }))
        .filter((slot) => slot.endMinute - slot.startMinute >= minBlock)
      const dayCapacity = maxMinutesWithItemBreaks(slots, minBlock)
      capacityByDate.set(
        date,
        usesObjectiveDailyCap(item)
          ? Math.min(dayCapacity, item.dailyCapMinutes)
          : dayCapacity,
      )
    }
    dayCapacityByItem.set(key, capacityByDate)
  }

  for (let itemIndex = 0; itemIndex < placeable.length; itemIndex += 1) {
    const item = placeable[itemIndex]!
    const key = itemKey(item)
    let budget = budgets.get(key) ?? 0
    const eligible = eligibleDatesForItem(item, dates)
    const minBlock = itemMinBlockMinutes(item)
    if (eligible.length === 0) continue

    let guard = 0
    while (budget >= minBlock && guard < 1000) {
      guard += 1
      let placedThisPass = false
      for (const date of eligible) {
        if (budget < minBlock) break
        const dayItem = perDayItem.get(`${date}|${key}`) ?? 0
        const dayCapacity = dayCapacityByItem.get(key)?.get(date) ?? 0
        if (dayItem >= dayCapacity) continue
        const fairTarget = fairTargetForDate(
          item,
          key,
          date,
          budget,
          eligible,
          perDayItem,
          dayCapacityByItem.get(key) ?? new Map(),
        )
        const remainingFairForDate = fairTarget - dayItem
        if (remainingFairForDate < minBlock) continue
        const categoryKey = itemCategoryKey(item, key)
        const categories = perDayCategories.get(date) ?? new Set<string>()
        if (!categories.has(categoryKey) && categories.size >= MAX_CATEGORIES_PER_DAY) continue

        const microUsed = perDayMicroMinutes.get(date) ?? 0
        const remainingMicroBudget = isMicroTaskItem(item)
          ? Math.max(0, MICRO_BATCH_DAILY_CAP - microUsed)
          : Number.POSITIVE_INFINITY
        if (remainingMicroBudget < minBlock) continue

        const streakKey = `${date}|${key}`
        const streak = perDayItemStreak.get(streakKey)
        const dateSlots = slotsByDate.get(date) ?? []
        const placement = findPlacementSlot({
          item,
          slots: dateSlots,
          date,
          streak,
          minBlock,
          options,
        })
        if (!placement) continue
        const { slot } = placement
        let { blockStart } = placement
        const { effectiveEnd } = placement
        const eveningStart = eveningStartByDate.get(date) ?? LOW_ENERGY_START_MINUTE
        const eveningCategories = perDayEveningCategories.get(date) ?? new Set<string>()
        const isNewEveningCategory = !eveningCategories.has(categoryKey)
        if (blockStart >= eveningStart) {
          if (isNewEveningCategory && eveningCategories.size >= policy.maxEveningCategories) continue
          if (
            isNewEveningCategory &&
            eveningCategories.size > 0 &&
            policy.mandatorySubjectBufferMinutes > 0
          ) {
            blockStart = Math.max(
              blockStart,
              (perDayLastEveningEnd.get(date) ?? blockStart) +
                policy.mandatorySubjectBufferMinutes,
            )
            if (effectiveEnd - blockStart < minBlock) continue
          }
        }

        const longSchoolEnd = longSchoolEndByDate.get(date) ?? null
        const postSchoolRemaining =
          longSchoolEnd !== null && blockStart >= longSchoolEnd
            ? Math.max(0, policy.postSchoolCapMinutes - (perDayPostSchoolMinutes.get(date) ?? 0))
            : Number.POSITIVE_INFINITY
        if (postSchoolRemaining < minBlock) continue
        const streakCapacity = remainingItemStreakCapacity(streak, blockStart)
        const capacity = Math.min(
          effectiveEnd - blockStart,
          dayCapacity - dayItem,
          streakCapacity,
          remainingFairForDate,
          remainingMicroBudget,
          postSchoolRemaining,
        )
        const size = chooseBlockSize(
          item,
          budget,
          capacity,
          options.todayStr,
        )
        if (size < minBlock) continue
        blocks.push({
          id: `${date}:${blockStart}:${item.kind}:${item.refId ?? ''}`,
          date,
          startMinute: blockStart,
          endMinute: blockStart + size,
          kind: item.kind,
          refKind: item.kind,
          refId: item.refId,
          label: item.label,
          locked: true,
          linkedTaskId: item.linkedTaskId,
          linkedTaskIds: item.linkedTaskIds,
        })
        reserveSlotTime(dateSlots, slot, blockStart, blockStart + size)
        const recoveryStart = blockStart + size
        const cycleWorkMinutes = (perDayCycleWorkMinutes.get(date) ?? 0) + size
        const cycleShortBreakMinutes = perDayCycleShortBreakMinutes.get(date) ?? 0
        const majorBreakDue = cycleWorkMinutes >= MAX_ITEM_STREAK_BEFORE_BREAK
        const majorBreakMinutes = majorBreakDue
          ? consolidatedMajorPauseMinutes(cycleShortBreakMinutes)
          : 0
        const shortBreakMinutes =
          !majorBreakDue && size >= ULTRADIAN_FOCUS_SPRINT_MINUTES
            ? ULTRADIAN_BUFFER_MINUTES
            : 0
        const breakMinutes = majorBreakDue ? majorBreakMinutes : shortBreakMinutes
        const breakLabel = majorBreakDue ? 'Pause majeure' : 'Récupération'
        if (options.includeRecoveryBlocks) {
          perDayCycleWorkMinutes.set(date, cycleWorkMinutes)
          perDayCycleShortBreakMinutes.set(date, cycleShortBreakMinutes)
        }
        if (breakMinutes > 0 && options.includeRecoveryBlocks) {
          const recoveryEnd = recoveryStart + breakMinutes
          const hasWorkAfterBreak = hasSchedulableWorkAfterRecovery({
            placeable,
            currentIndex: itemIndex,
            budgets,
            currentBudgetAfterBlock: budget - size,
            currentBlockSize: size,
            date,
            recoveryEnd,
            slots: dateSlots,
            dayCapacityByItem,
            perDayItem,
          })
          if (canReserveRecoveryBuffer(slot, recoveryStart, breakMinutes) && hasWorkAfterBreak) {
            blocks.push(
              recoveryBlockFor({
                date,
                startMinute: recoveryStart,
                sourceId: `${item.kind}:${item.refId ?? 'unknown'}`,
                minutes: breakMinutes,
                label: breakLabel,
              }),
            )
            reserveSlotTime(dateSlots, slot, recoveryStart, recoveryEnd)
            if (majorBreakDue) {
              perDayCycleWorkMinutes.set(date, 0)
              perDayCycleShortBreakMinutes.set(date, 0)
            } else {
              perDayCycleShortBreakMinutes.set(date, cycleShortBreakMinutes + breakMinutes)
            }
          }
        } else if (majorBreakDue && options.includeRecoveryBlocks) {
          perDayCycleWorkMinutes.set(date, 0)
          perDayCycleShortBreakMinutes.set(date, 0)
        }
        budget -= size
        perDayItem.set(`${date}|${key}`, dayItem + size)
        perDayItemStreak.set(streakKey, nextItemStreakState(streak, blockStart, size))
        categories.add(categoryKey)
        perDayCategories.set(date, categories)
        if (longSchoolEnd !== null && blockStart >= longSchoolEnd) {
          perDayPostSchoolMinutes.set(
            date,
            (perDayPostSchoolMinutes.get(date) ?? 0) + size,
          )
        }
        if (blockStart >= eveningStart) {
          eveningCategories.add(categoryKey)
          perDayEveningCategories.set(date, eveningCategories)
          perDayLastEveningEnd.set(date, blockStart + size)
        }
        if (isMicroTaskItem(item)) {
          perDayMicroMinutes.set(date, microUsed + size)
        }
        placedThisPass = true
      }
      if (!placedThisPass) break
    }
  }

  return dropRecoveryBlocksWithoutFollowingWork(blocks)
}

// ─── Fonction publique (spec §3, §10) ───────────────────────────────────────

export type ComputePlacementInput = {
  tasks: Task[]
  objectives: Objective[]
  rules: TimeRule[]
  entries: ScheduleEntry[]
  /** Premier jour planifié + ancre du multiplicateur d'échéance. */
  todayStr: string
  /** Dernier jour demandé ; le moteur borne par défaut à todayStr + 6. */
  rangeEndStr: string
  /** Nombre maximal de jours planifiables. Défaut : 7. */
  maxPlanningDays?: number
  /** Minute locale courante pour aujourd'hui ; les blocs passés sont exclus. */
  todayStartMinute?: number
  /** Minute locale du réveil déclaré. Sert au sas matinal et au pic cognitif. */
  wakeMinute?: number | null
  /** Chronotype utilisateur pour décaler la fenêtre de pic cognitif. */
  chronotype?: Chronotype
  /** Heure locale de pic passivement détectée. Prioritaire sur le chronotype manuel. */
  peakAlertnessHour?: number | null
  /** Durée du sas matinal en minutes. Défaut : 30. */
  morningBufferMinutes?: number
  /** Affiche et réserve les buffers de récupération ultradienne. */
  includeRecoveryBlocks?: boolean
  /** Date locale à alléger après un coucher tardif détecté passivement. */
  fatigueRecoveryDate?: string | null
  /** Minutes retirées de la capacité maximale de cette date de récupération. */
  fatigueRecoveryMinutes?: number
}

type PlacementTrial = {
  policy: CognitivePolicy
  windowOptions: PlacementWindowOptions
  slotsByDate: Map<string, WorkSlot[]>
  totalFree: number
  budgets: Map<string, number>
  breakdowns: ItemBudgetBreakdown[]
  blocks: PlacedBlock[]
}

function placedMinutesByKey(blocks: PlacedBlock[]): Map<string, number> {
  const placedByKey = new Map<string, number>()
  for (const block of blocks) {
    if (block.kind === 'break' || block.kind === 'free') continue
    const key = `${block.kind}:${block.refId}`
    placedByKey.set(key, (placedByKey.get(key) ?? 0) + (block.endMinute - block.startMinute))
  }
  return placedByKey
}

function placementTrialFits(trial: PlacementTrial): boolean {
  const placedByKey = placedMinutesByKey(trial.blocks)
  return trial.breakdowns.every((breakdown) => {
    if (breakdown.cappedMinutes <= 0) return true
    if (breakdown.status === 'impossible') return false
    return (placedByKey.get(breakdown.key) ?? 0) >= breakdown.cappedMinutes
  })
}

/**
 * Calcule le plan complet : blocs + diagnostics humains. Pure et déterministe
 * — mêmes entrées ⇒ même sortie.
 */
export function computePlacementPlan(input: ComputePlacementInput): PlacementPlan {
  const {
    tasks,
    objectives,
    rules,
    entries,
    todayStr,
    rangeEndStr,
    maxPlanningDays,
    todayStartMinute = 0,
    wakeMinute,
    chronotype = 'intermediate',
    peakAlertnessHour,
    morningBufferMinutes = 30,
    includeRecoveryBlocks = false,
    fatigueRecoveryDate,
    fatigueRecoveryMinutes,
  } = input
  const clampedRangeEnd = clampPlanningRangeEnd(todayStr, rangeEndStr, maxPlanningDays)
  const dates = enumerateDates(todayStr, clampedRangeEnd)
  if (dates.length === 0) return { blocks: [], diagnostics: emptyPlacementDiagnostics() }

  const forceBlocks: PlacedBlock[] = []
  for (const task of tasks) {
    if (
      task.status === 'active' &&
      task.devForceDate &&
      task.devForceStartMinute !== undefined &&
      task.devForceEndMinute !== undefined &&
      dates.includes(task.devForceDate)
    ) {
      forceBlocks.push({
        id: `dev-force-${task.id}`,
        date: task.devForceDate,
        startMinute: task.devForceStartMinute,
        endMinute: task.devForceEndMinute,
        kind: 'task',
        refKind: 'task',
        refId: task.id,
        label: task.title,
        locked: true,
        linkedTaskId: null,
        linkedTaskIds: [],
      })
    }
  }

  const items = buildItems(tasks, objectives, todayStr, todayStartMinute)
  const baseWindowOptions: PlacementWindowOptions = {
    todayStr,
    todayStartMinute,
    wakeMinute,
    chronotype,
    peakAlertnessHour,
    morningBufferMinutes,
    includeRecoveryBlocks,
    fatigueRecoveryDate,
    fatigueRecoveryMinutes,
  }

  const trials = COGNITIVE_POLICIES.map((policy): PlacementTrial => {
    const windowOptions = { ...baseWindowOptions, cognitivePolicy: policy }
    const slotsByDate = new Map<string, WorkSlot[]>()
    for (const date of dates) {
      slotsByDate.set(date, workSlotsForDate(date, entries, rules, windowOptions))
    }
    const totalFree = [...slotsByDate.values()].reduce((sum, slots) => sum + minutesInSlots(slots), 0)
    const { budgets, breakdowns } = computeBudgetBreakdowns({
      items,
      dates,
      tasks,
      todayStr,
      todayStartMinute,
      slotsByDate,
    })
    const blocks = placeBlocks(items, budgets, dates, entries, rules, windowOptions)
    return { policy, windowOptions, slotsByDate, totalFree, budgets, breakdowns, blocks }
  })
  const selectedTrial =
    trials.find((trial) => placementTrialFits(trial)) ?? trials[trials.length - 1]!

  const { policy, totalFree, breakdowns, blocks: trialBlocks } = selectedTrial
  const blocks = [...trialBlocks, ...forceBlocks]
  const placedByKey = placedMinutesByKey(blocks)

  const finalBreakdowns = breakdowns.map((breakdown) => {
    const placedMinutes = placedByKey.get(breakdown.key) ?? 0
    let placementStatus: PlacementStatus = breakdown.status
    if (breakdown.status !== 'impossible') {
      if (breakdown.rawBudgetMinutes > 0) {
        if (breakdown.placeableMinutes < breakdown.rawBudgetMinutes) {
          placementStatus = 'impossible'
        } else if (placedMinutes < breakdown.rawBudgetMinutes) {
          placementStatus = 'risk'
        }
      } else if (
        breakdown.placeableMinutes >= breakdown.minBlockMinutes &&
        placedMinutes < breakdown.placeableMinutes
      ) {
        placementStatus = 'risk'
      }
    }
    return {
      ...breakdown,
      placedMinutes,
      unplannedMinutes: Math.max(0, breakdown.cappedMinutes - placedMinutes),
      status: worstStatus([breakdown.status, placementStatus]),
    }
  })
  const plannedMinutes = blocks
    .filter((block) => block.kind === 'task' || block.kind === 'objective')
    .reduce(
      (sum, block) => sum + (block.endMinute - block.startMinute),
      0,
    )
  const recoveryMinutes = blocks
    .filter((block) => block.kind === 'break')
    .reduce((sum, block) => sum + (block.endMinute - block.startMinute), 0)
  const unplannedMinutes = Math.max(0, totalFree - plannedMinutes - recoveryMinutes)
  const diagnostics: PlacementDiagnostics = {
    status: worstStatus(finalBreakdowns.map((breakdown) => breakdown.status)),
    totalFreeMinutes: totalFree,
    plannedMinutes,
    recoveryMinutes,
    fatigueReductionMinutes:
      fatigueRecoveryDate && dates.includes(fatigueRecoveryDate)
        ? floorToFive(Math.max(0, fatigueRecoveryMinutes ?? 0))
        : 0,
    cognitivePolicy: policy.step,
    relaxedRules: policy.relaxedRules,
    unplannedMinutes,
    items: finalBreakdowns,
  }

  return { blocks, diagnostics }
}

/**
 * Compatibilité UI existante : renvoie seulement les blocs.
 */
export function computePlacement(input: ComputePlacementInput): PlacedBlock[] {
  return computePlacementPlan(input).blocks
}

/**
 * Génère le snapshot statique du lendemain : aucune minute "déjà passée" n'est
 * appliquée, ce qui permet de le calculer la veille puis de l'afficher tel quel.
 */
export function computeStaticTomorrowPlacementPlan(input: ComputePlacementInput): PlacementPlan {
  const tomorrowStr = addDaysStr(input.todayStr, 1)
  return computePlacementPlan({
    ...input,
    todayStr: tomorrowStr,
    rangeEndStr: tomorrowStr,
    todayStartMinute: 0,
  })
}

// ─── Charge quotidienne — vue Mois (spec §8.3) ──────────────────────────────

export type DailyLoad = {
  date: string
  workedMinutes: number
  /** Temps libre restant = temps libre total du jour − temps travaillé placé. */
  freeMinutes: number
}

/**
 * Pour chaque date, calcule le temps travaillé (somme des blocs tâche/objectif)
 * et le temps libre restant. Sert à colorer la vue Mois.
 */
export function summarizeDailyLoad(
  blocks: PlacedBlock[],
  dates: string[],
  entries: ScheduleEntry[],
  rules: TimeRule[],
  options: PlacementWindowOptions = {},
): DailyLoad[] {
  return dates.map((date) => {
    let totalSlot = 0
    for (const slot of workSlotsForDate(date, entries, rules, options)) {
      totalSlot += slot.endMinute - slot.cursor
    }
    const workedMinutes = blocks
      .filter((b) => b.date === date && b.kind !== 'free')
      .reduce((sum, b) => sum + (b.endMinute - b.startMinute), 0)
    return { date, workedMinutes, freeMinutes: Math.max(0, totalSlot - workedMinutes) }
  })
}
