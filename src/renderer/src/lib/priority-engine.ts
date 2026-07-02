import type { EngineReasonTag, PriorityResult } from '@shared/engine-results'
import type { Objective, Task } from '@shared/schemas'
import type { UserModel } from '@shared/user-model'
import { estimateMinutesForLevel, getDeadlineMultiplier } from './free-time-calculator'

export type PriorityEngineContext = {
  todayStr?: string
  todayStartMinute?: number
  usableFreeMinutesBeforeDeadline?: number | null
  currentScore?: number
  now?: Date
  recentlyWorkedTargetIds?: string[]
  recentlyCompletedTaskIds?: string[]
  recentlyIgnoredTargetIds?: string[]
  goodCognitiveWindow?: boolean
  /** Objective chosen as the user's current main commitment. Callers derive it from all objectives + UserModel. */
  primaryObjectiveId?: string | null
}

/**
 * Priority builders deliberately do not read stores or history themselves: they remain pure and portable.
 * This selector is the single preparation point used by callers so history/identity signals are not ad hoc.
 */
export function selectPrimaryObjectiveId(objectives: readonly Objective[], userModel?: UserModel | null): string | null {
  const active = objectives.filter((objective) => objective.status === 'active')
  if (!active.length) return null
  return [...active].sort((left, right) => {
    const score = (objective: Objective): number => {
      const preference = userModel?.objectivePreferences.find((item) => item.objectiveId === objective.id)
      return objective.level * 10 + (preference?.declaredImportanceScore ?? 0) * .45 +
        (preference?.observedCommitmentScore ?? 0) * .35 + (preference?.lifeImpactScore ?? 0) * .2
    }
    return score(right) - score(left) || left.createdAt.localeCompare(right.createdAt)
  })[0]?.id ?? null
}

type DeadlineState = {
  diffDays: number
  isToday: boolean
  isOverdue: boolean
  multiplier: number
}

const COMPLEXITY_SCORE: Record<NonNullable<Task['complexity']>, number> = {
  easy: 25,
  normal: 45,
  hard: 70,
  manual: 40,
  extreme: 100,
  unknown: 60,
}

const WORKLOAD_POINTS: Array<[minutes: number, score: number]> = [
  [0, 0],
  [30, 20],
  [120, 50],
  [360, 80],
  [600, 100],
]

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

function uniqueTags(tags: EngineReasonTag[]): EngineReasonTag[] {
  return Array.from(new Set(tags))
}

function localDateKey(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function minutesSinceStartOfDay(date = new Date()): number {
  return date.getHours() * 60 + date.getMinutes()
}

function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number) as [number, number, number]
  return new Date(year, month - 1, day)
}

function daysBetweenLocalDates(fromDateStr: string, toDateStr: string): number {
  const from = parseLocalDate(fromDateStr)
  const to = parseLocalDate(toDateStr)
  return Math.round((to.getTime() - from.getTime()) / 86_400_000)
}

function ageDaysFromIso(createdAt: string | undefined, todayStr: string): number {
  if (!createdAt) return 0
  const createdDate = /^\d{4}-\d{2}-\d{2}/u.exec(createdAt)?.[0]
  if (!createdDate) return 0
  return Math.max(0, daysBetweenLocalDates(createdDate, todayStr))
}

function parseDeadlineMinute(deadlineTime?: string): number | null {
  if (!deadlineTime) return null
  const match = /^(\d{2}):(\d{2})$/u.exec(deadlineTime)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  return hours * 60 + minutes
}

function taskComplexity(task: Task): NonNullable<Task['complexity']> {
  return task.difficulty ?? task.complexity ?? 'normal'
}

function normalizedTaskMinutes(task: Task): { estimatedMinutes: number; remainingMinutes: number } {
  const estimatedMinutes = Math.max(0, task.estimatedMinutes ?? estimateMinutesForLevel(task.level))
  const remainingMinutes =
    task.status === 'completed'
      ? 0
      : Math.max(0, task.remainingMinutes ?? task.estimatedMinutes ?? estimatedMinutes)

  return {
    estimatedMinutes: Math.max(estimatedMinutes, remainingMinutes),
    remainingMinutes,
  }
}

function progressRatio(estimatedMinutes: number, remainingMinutes: number): number {
  if (estimatedMinutes <= 0) return 1
  return Math.max(0, Math.min(1, (estimatedMinutes - remainingMinutes) / estimatedMinutes))
}

function taskDeadlineState(task: Task, todayStr: string, todayStartMinute: number): DeadlineState {
  const diffDays = daysBetweenLocalDates(todayStr, task.deadline)
  const deadlineMinute = parseDeadlineMinute(task.deadlineTime)
  const isToday = diffDays === 0
  const isOverdue =
    task.status === 'expired' ||
    diffDays < 0 ||
    (diffDays === 0 && deadlineMinute !== null && todayStartMinute >= deadlineMinute)
  const multiplier =
    isToday && !isOverdue
      ? 2
      : getDeadlineMultiplier(task.deadline, todayStr, task.deadlineImpact ?? 'recoverable')

  return { diffDays, isToday, isOverdue, multiplier }
}

function interpolateScore(points: Array<[number, number]>, value: number): number {
  if (value <= points[0]![0]) return points[0]![1]
  for (let i = 1; i < points.length; i += 1) {
    const [rightValue, rightScore] = points[i]!
    const [leftValue, leftScore] = points[i - 1]!
    if (value <= rightValue) {
      const ratio = (value - leftValue) / Math.max(1, rightValue - leftValue)
      return leftScore + (rightScore - leftScore) * ratio
    }
  }
  return points[points.length - 1]![1]
}

function workloadScoreFromMinutes(remainingMinutes: number): number {
  return clampScore(interpolateScore(WORKLOAD_POINTS, remainingMinutes))
}

function complexityScoreForTask(task: Task, remainingMinutes: number): number {
  const complexity = taskComplexity(task)
  let score = COMPLEXITY_SCORE[complexity]
  if (complexity === 'manual' && remainingMinutes >= 600) score = 85
  else if (complexity === 'manual' && remainingMinutes >= 360) score = 70
  return clampScore(score)
}

function urgencyScoreForTask(args: {
  task: Task
  deadline: DeadlineState
  remainingMinutes: number
  usableFreeMinutesBeforeDeadline?: number | null
}): { urgencyScore: number; deadlineRiskRatio: number | null } {
  if (args.task.status === 'completed') return { urgencyScore: 0, deadlineRiskRatio: null }
  if (args.deadline.isOverdue) return { urgencyScore: 100, deadlineRiskRatio: null }

  const usable = args.usableFreeMinutesBeforeDeadline
  if (typeof usable === 'number' && Number.isFinite(usable) && usable > 0) {
    const ratio = args.remainingMinutes / usable
    if (ratio >= 1.2) return { urgencyScore: 100, deadlineRiskRatio: ratio }
    if (ratio >= 0.8) return { urgencyScore: 85, deadlineRiskRatio: ratio }
    if (ratio >= 0.5) return { urgencyScore: 60, deadlineRiskRatio: ratio }
    if (ratio >= 0.25) return { urgencyScore: 35, deadlineRiskRatio: ratio }
    return { urgencyScore: 15, deadlineRiskRatio: ratio }
  }

  let urgencyScore = 25
  if (args.deadline.isToday) urgencyScore = 90
  else if (args.deadline.multiplier >= 2) urgencyScore = 85
  else if (args.deadline.multiplier >= 1.6) urgencyScore = 70
  else if (args.deadline.multiplier >= 1.3) urgencyScore = 55

  if (args.task.deadlineImpact === 'hard') urgencyScore += 10
  return { urgencyScore: clampScore(urgencyScore), deadlineRiskRatio: null }
}

function valueScoreForTask(task: Task, deadline: DeadlineState, linkedObjective?: Objective | null, primaryObjectiveId?: string | null): number {
  if (task.status === 'completed') return 15

  let score = 35
  if (linkedObjective) score += linkedObjective.status === 'active' ? 20 : 10
  if (linkedObjective && linkedObjective.level >= 6) score += 20
  else if (linkedObjective && linkedObjective.level >= 5) score += 10
  if (!linkedObjective && deadline.diffDays >= 0 && deadline.diffDays <= 3) score += 10
  if (task.level >= 8) score += 10
  else if (task.level >= 6) score += 5
  if (task.status === 'expired') score += 10
  if (linkedObjective?.id === primaryObjectiveId) score += 15
  return clampScore(score)
}

function scoreFromAge(ageDays: number): number {
  if (ageDays >= 14) return 75
  if (ageDays >= 7) return 50
  if (ageDays >= 3) return 25
  return 10
}

function includesId(ids: string[] | undefined, id: string): boolean {
  return Boolean(ids?.includes(id))
}

function stagnationScoreForTask(args: {
  task: Task
  progress: number
  todayStr: string
  context: PriorityEngineContext
}): number {
  if (args.task.status === 'completed') return 0
  const ageDays = ageDaysFromIso(args.task.createdAt, args.todayStr)
  let score = scoreFromAge(ageDays)
  if (args.progress < 0.25 && ageDays >= 3) score += 20
  if (args.task.status === 'expired') score += 30
  if (includesId(args.context.recentlyIgnoredTargetIds, args.task.id)) score += 20
  if (includesId(args.context.recentlyWorkedTargetIds, args.task.id)) score -= 25
  return clampScore(score)
}

function momentumScoreForTask(args: {
  task: Task
  progress: number
  remainingMinutes: number
  context: PriorityEngineContext
}): number {
  if (args.task.status === 'completed') return 70
  let score = 10
  if (args.progress >= 0.85 || args.remainingMinutes <= 30) score = 75
  else if (args.progress >= 0.5) score = 60
  else if (args.progress >= 0.25) score = 45
  else if (args.progress > 0) score = 25
  if (includesId(args.context.recentlyWorkedTargetIds, args.task.id)) score += 25
  if (includesId(args.context.recentlyCompletedTaskIds, args.task.id)) score += 25
  return clampScore(score)
}

function finalPriorityScore(scores: {
  urgencyScore: number
  valueScore: number
  workloadScore: number
  complexityScore: number
  stagnationScore: number
  momentumScore: number
}): number {
  return clampScore(
    0.3 * scores.urgencyScore +
      0.2 * scores.valueScore +
      0.15 * scores.workloadScore +
      0.1 * scores.complexityScore +
      0.15 * scores.stagnationScore +
      0.1 * scores.momentumScore,
  )
}

function confidenceFromSignals(signalCount: number, dataSignals: number): number {
  return clampScore(45 + signalCount * 5 + dataSignals * 7)
}

function humanReasonForTag(tag: EngineReasonTag): string {
  switch (tag) {
    case 'deadline_overdue':
      return 'La deadline est déjà dépassée.'
    case 'deadline_today':
      return 'La deadline est aujourd’hui.'
    case 'deadline_soon':
      return 'La deadline approche.'
    case 'large_remaining_work':
      return 'Il reste beaucoup de travail.'
    case 'high_complexity':
      return 'La tâche demande une concentration élevée.'
    case 'low_progress':
      return 'La progression est encore faible.'
    case 'almost_completed':
      return 'La tâche est presque terminée.'
    case 'linked_to_objective':
      return 'Cette tâche est liée à un objectif.'
    case 'high_objective_value':
    case 'objective_high_level':
      return 'L’objectif lié a une valeur élevée.'
    case 'recently_ignored':
      return 'Cette priorité semble avoir été repoussée récemment.'
    case 'stagnating':
      return 'Cette priorité commence à stagner.'
    case 'momentum_detected':
      return 'Il y a un élan récent sur ce sujet.'
    case 'limited_free_time':
      return 'Le temps libre disponible avant la deadline est limité.'
    case 'good_cognitive_window':
      return 'Le moment semble bon pour une tâche demandante.'
    case 'active_objective':
      return 'L’objectif est actif.'
    case 'large_objective_scope':
      return 'L’objectif contient encore beaucoup de travail.'
    default:
      return 'Vethos a détecté un signal utile pour cette décision.'
  }
}

function humanReasons(tags: EngineReasonTag[]): string[] {
  return tags.map(humanReasonForTag)
}

export function buildTaskPriorityResult(
  task: Task,
  linkedObjective?: Objective | null,
  context: PriorityEngineContext = {},
): PriorityResult {
  const now = context.now ?? new Date()
  const todayStr = context.todayStr ?? localDateKey(now)
  const todayStartMinute = context.todayStartMinute ?? minutesSinceStartOfDay(now)
  const { estimatedMinutes, remainingMinutes } = normalizedTaskMinutes(task)
  const progress = progressRatio(estimatedMinutes, remainingMinutes)
  const deadline = taskDeadlineState(task, todayStr, todayStartMinute)
  const { urgencyScore, deadlineRiskRatio } = urgencyScoreForTask({
    task,
    deadline,
    remainingMinutes,
    usableFreeMinutesBeforeDeadline: context.usableFreeMinutesBeforeDeadline,
  })
  const workloadScore = workloadScoreFromMinutes(remainingMinutes)
  const complexityScore = complexityScoreForTask(task, remainingMinutes)
  const valueScore = valueScoreForTask(task, deadline, linkedObjective, context.primaryObjectiveId)
  const stagnationScore = stagnationScoreForTask({ task, progress, todayStr, context })
  const momentumScore = momentumScoreForTask({ task, progress, remainingMinutes, context })
  const priorityScore =
    task.status === 'completed'
      ? 0
      : finalPriorityScore({
          urgencyScore,
          valueScore,
          workloadScore,
          complexityScore,
          stagnationScore,
          momentumScore,
        })

  const tags: EngineReasonTag[] = []
  if (deadline.isOverdue) tags.push('deadline_overdue')
  else if (deadline.isToday) tags.push('deadline_today')
  else if (deadline.diffDays > 0 && deadline.diffDays <= 3) tags.push('deadline_soon')
  if (remainingMinutes >= 120) tags.push('large_remaining_work')
  if (complexityScore >= 70) tags.push('high_complexity')
  if (progress < 0.25 && remainingMinutes > 30) tags.push('low_progress')
  if (progress >= 0.85 || remainingMinutes <= 30 || task.status === 'completed') {
    tags.push('almost_completed')
  }
  if (linkedObjective) tags.push('linked_to_objective')
  if (linkedObjective && linkedObjective.level >= 6) tags.push('high_objective_value')
  if (includesId(context.recentlyIgnoredTargetIds, task.id)) tags.push('recently_ignored')
  if (stagnationScore >= 60) tags.push('stagnating')
  if (momentumScore >= 60) tags.push('momentum_detected')
  if (deadlineRiskRatio !== null && deadlineRiskRatio >= 0.8) tags.push('limited_free_time')
  if (context.goodCognitiveWindow) tags.push('good_cognitive_window')

  const reasonTags = uniqueTags(tags)
  const dataSignals = [
    task.estimatedMinutes !== undefined,
    task.remainingMinutes !== undefined,
    task.complexity !== undefined || task.difficulty !== undefined,
    Boolean(linkedObjective),
    context.usableFreeMinutesBeforeDeadline !== undefined,
  ].filter(Boolean).length

  return {
    kind: 'task',
    targetId: task.id,
    priorityScore,
    urgencyScore,
    valueScore,
    workloadScore,
    complexityScore,
    stagnationScore,
    momentumScore,
    reasonTags,
    humanReasons: humanReasons(reasonTags),
    confidence: confidenceFromSignals(reasonTags.length, dataSignals),
    debug: {
      estimatedMinutes,
      remainingMinutes,
      progress,
      deadlineDiffDays: deadline.diffDays,
      deadlineMultiplier: deadline.multiplier,
      deadlineRiskRatio,
      taskLevel: task.level,
      currentScore: context.currentScore,
      complexity: taskComplexity(task),
      linkedObjectiveId: linkedObjective?.id ?? null,
      primaryObjectiveId: context.primaryObjectiveId ?? null,
    },
  }
}

function objectiveValueScore(objective: Objective, primaryObjectiveId?: string | null): number {
  if (objective.status === 'completed') return 15
  return clampScore(45 + Math.max(0, objective.level - 3) * 12 + (objective.level >= 6 ? 10 : 0) + (objective.id === primaryObjectiveId ? 15 : 0))
}

export function buildObjectivePriorityResult(
  objective: Objective,
  linkedTasks: Task[] = [],
  context: PriorityEngineContext = {},
): PriorityResult {
  const now = context.now ?? new Date()
  const todayStr = context.todayStr ?? localDateKey(now)
  const activeTasks = linkedTasks.filter((task) => task.status !== 'completed')
  const completedTasks = linkedTasks.filter((task) => task.status === 'completed')
  const taskResults = activeTasks.map((task) => buildTaskPriorityResult(task, objective, context))
  const remainingMinutes = activeTasks.reduce((sum, task) => {
    return sum + normalizedTaskMinutes(task).remainingMinutes
  }, 0)
  const urgencyScore = objective.status === 'completed' ? 0 : Math.max(20, ...taskResults.map((r) => r.urgencyScore))
  const valueScore = objectiveValueScore(objective, context.primaryObjectiveId)
  const workloadScore = workloadScoreFromMinutes(remainingMinutes)
  const complexityScore =
    taskResults.length > 0
      ? clampScore(taskResults.reduce((sum, result) => sum + result.complexityScore, 0) / taskResults.length)
      : clampScore(35 + objective.level * 7)
  const objectiveWorkedRecently = includesId(context.recentlyWorkedTargetIds, objective.id)
  const completedLinkedRecently = completedTasks.some((task) =>
    includesId(context.recentlyCompletedTaskIds, task.id),
  )
  const objectiveAgeDays = ageDaysFromIso(objective.createdAt, todayStr)
  let stagnationScore = objective.status === 'completed' ? 0 : scoreFromAge(objectiveAgeDays)
  if (objective.status === 'active' && activeTasks.length === 0) stagnationScore += 25
  if (objective.status === 'active' && activeTasks.length > 0 && !objectiveWorkedRecently) {
    stagnationScore += objectiveAgeDays >= 7 ? 15 : 5
  }
  if (objectiveWorkedRecently || completedLinkedRecently) stagnationScore -= 25
  stagnationScore = clampScore(stagnationScore)

  let momentumScore = 10
  if (objectiveWorkedRecently) momentumScore += 35
  if (completedLinkedRecently) momentumScore += 35
  if (taskResults.some((result) => result.momentumScore >= 60)) momentumScore += 20
  if (linkedTasks.length > 0 && activeTasks.length === 0) momentumScore += 35
  momentumScore = clampScore(momentumScore)

  const priorityScore =
    objective.status === 'completed'
      ? 0
      : finalPriorityScore({
          urgencyScore,
          valueScore,
          workloadScore,
          complexityScore,
          stagnationScore,
          momentumScore,
        })

  const tags: EngineReasonTag[] = []
  if (objective.status === 'active') tags.push('active_objective')
  if (objective.level >= 6) tags.push('high_objective_value')
  if (remainingMinutes >= 360 || activeTasks.length >= 3) tags.push('large_objective_scope')
  if (taskResults.some((result) => result.reasonTags.includes('deadline_overdue'))) {
    tags.push('deadline_overdue')
  } else if (taskResults.some((result) => result.reasonTags.includes('deadline_today'))) {
    tags.push('deadline_today')
  } else if (taskResults.some((result) => result.reasonTags.includes('deadline_soon'))) {
    tags.push('deadline_soon')
  }
  if (stagnationScore >= 60) tags.push('stagnating')
  if (momentumScore >= 60) tags.push('momentum_detected')
  if (context.goodCognitiveWindow) tags.push('good_cognitive_window')

  const reasonTags = uniqueTags(tags)

  return {
    kind: 'objective',
    targetId: objective.id,
    priorityScore,
    urgencyScore,
    valueScore,
    workloadScore,
    complexityScore,
    stagnationScore,
    momentumScore,
    reasonTags,
    humanReasons: humanReasons(reasonTags),
    confidence: confidenceFromSignals(reasonTags.length, Math.min(5, 2 + linkedTasks.length)),
    debug: {
      objectiveLevel: objective.level,
      linkedTaskCount: linkedTasks.length,
      activeTaskCount: activeTasks.length,
      completedTaskCount: completedTasks.length,
      remainingLinkedWorkMinutes: remainingMinutes,
      objectiveWorkedRecently,
      completedLinkedRecently,
      primaryObjectiveId: context.primaryObjectiveId ?? null,
    },
  }
}
