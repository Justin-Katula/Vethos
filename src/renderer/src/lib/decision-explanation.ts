import type { Objective, Task } from '@shared/schemas'
import type { EngineReasonTag } from '@shared/engine-results'
import type { PlacedBlock } from './placement-engine'
import { estimateMinutesForLevel, getDeadlineMultiplier } from './free-time-calculator'

export type DecisionReasonTag = EngineReasonTag

export type DecisionExplanation = {
  targetType: 'task' | 'objective' | 'planning_block' | 'session' | 'app' | 'site'
  targetId?: string
  reasonTags: DecisionReasonTag[]
  humanTitle: string
  humanReasons: string[]
  severity: 'low' | 'medium' | 'high' | 'critical'
  confidence: number
  debug?: {
    score?: number
    deadlineMultiplier?: number
    complexityCoefficient?: number
    progressCoefficient?: number
    remainingMinutes?: number
    estimatedMinutes?: number
  }
}

export type ExplainTaskDecisionOptions = {
  todayStr?: string
  todayStartMinute?: number
}

export type BlockingDecisionSubject = {
  kind: 'app' | 'site'
  id?: string
  label: string
  identifier?: string
}

export type BlockingDecisionContext = {
  sessionActive?: boolean
  focusLabel?: string
  mode?: 'blocklist' | 'allowlist'
  allowed?: boolean
  blocked?: boolean
  protectionLevel?: number
}

const COMPLEXITY_COEFFICIENT: Record<string, number> = {
  easy: 1,
  normal: 1.2,
  hard: 1.5,
  manual: 1,
  extreme: 2.4,
  unknown: 1.8,
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

function complexityCoefficient(task: Task): number {
  return COMPLEXITY_COEFFICIENT[taskComplexity(task)] ?? COMPLEXITY_COEFFICIENT.unknown!
}

function progressCoefficient(estimatedMinutes: number, remainingMinutes: number): number {
  if (estimatedMinutes <= 0) return 0.3
  const progress = Math.max(0, Math.min(1, (estimatedMinutes - remainingMinutes) / estimatedMinutes))
  if (progress >= 0.9) return 0.3
  if (progress >= 0.75) return 0.5
  if (progress >= 0.5) return 0.7
  if (progress >= 0.25) return 0.85
  return 1
}

function taskDeadlineState(
  task: Task,
  todayStr: string,
  todayStartMinute: number,
): {
  diffDays: number
  isToday: boolean
  isOverdue: boolean
  deadlineMultiplier: number
} {
  const diffDays = daysBetweenLocalDates(todayStr, task.deadline)
  const deadlineMinute = parseDeadlineMinute(task.deadlineTime)
  const isToday = diffDays === 0
  const isOverdue =
    diffDays < 0 ||
    (diffDays === 0 && deadlineMinute !== null && todayStartMinute >= deadlineMinute)
  const deadlineMultiplier =
    isToday && deadlineMinute !== null
      ? todayStartMinute < deadlineMinute
        ? 2
        : 0
      : getDeadlineMultiplier(task.deadline, todayStr, task.deadlineImpact ?? 'recoverable')

  return { diffDays, isToday, isOverdue, deadlineMultiplier }
}

function uniqueTags(tags: DecisionReasonTag[]): DecisionReasonTag[] {
  return Array.from(new Set(tags))
}

function confidenceFromSignals(signalCount: number, hasObjective: boolean, hasDebug: boolean): number {
  return Math.max(
    35,
    Math.min(95, 58 + signalCount * 6 + (hasObjective ? 8 : 0) + (hasDebug ? 8 : 0)),
  )
}

function severityFromScore(args: {
  score: number
  isOverdue: boolean
  isToday: boolean
  remainingMinutes: number
  almostCompleted: boolean
}): DecisionExplanation['severity'] {
  if (args.almostCompleted) return 'medium'
  if (args.isOverdue || (args.isToday && args.remainingMinutes >= 90) || args.score >= 18) {
    return 'critical'
  }
  if (args.score >= 10 || (args.isToday && args.remainingMinutes >= 45)) return 'high'
  if (args.score >= 4 || args.remainingMinutes >= 60) return 'medium'
  return 'low'
}

function titleForSeverity(
  severity: DecisionExplanation['severity'],
  task: Task,
  almostCompleted: boolean,
): string {
  if (task.status === 'completed') return 'Tâche terminée'
  if (task.status === 'expired') return 'Tâche expirée'
  if (almostCompleted) return 'Presque terminé'
  if (severity === 'critical') return 'Priorité critique'
  if (severity === 'high') return 'Priorité élevée'
  if (severity === 'medium') return 'Priorité modérée'
  return 'Priorité faible'
}

function reasonForTag(tag: DecisionReasonTag, data?: { objectiveName?: string; focusLabel?: string }): string {
  switch (tag) {
    case 'deadline_overdue':
      return 'La deadline est déjà passée ou l’heure limite est dépassée.'
    case 'deadline_today':
      return 'La deadline est aujourd’hui.'
    case 'deadline_soon':
      return 'La deadline approche.'
    case 'large_remaining_work':
      return 'Il reste encore beaucoup de travail.'
    case 'high_complexity':
      return 'Cette tâche demande une forte concentration.'
    case 'low_progress':
      return 'La tâche est encore peu avancée.'
    case 'almost_completed':
      return 'La tâche est presque terminée, donc un petit bloc peut suffire.'
    case 'linked_to_objective':
      return data?.objectiveName
        ? `Cette tâche est liée à l’objectif “${data.objectiveName}”.`
        : 'Cette tâche est liée à un objectif actif.'
    case 'objective_high_level':
      return 'L’objectif lié a un niveau de protection élevé.'
    case 'high_objective_value':
      return 'L’objectif lié a une valeur élevée pour l’utilisateur.'
    case 'good_time_slot':
      return 'Ce créneau donne assez d’espace pour avancer proprement.'
    case 'poor_time_slot':
      return 'Ce créneau est court pour ce type de travail.'
    case 'limited_free_time':
      return 'Le temps libre disponible est limité, donc Vethos protège ce bloc.'
    case 'recently_ignored':
      return 'Cette priorité semble avoir été repoussée récemment.'
    case 'stagnating':
      return 'Cette priorité commence à stagner.'
    case 'momentum_detected':
      return 'Vethos détecte un élan récent sur ce sujet.'
    case 'good_cognitive_window':
      return 'Ce moment semble adapté à un effort mental sérieux.'
    case 'session_active':
      return 'Une session de protection est active.'
    case 'blocking_required':
      return 'Le blocage aide à protéger cette décision contre les distractions.'
    case 'allowed_for_task':
      return data?.focusLabel
        ? `Cet élément est utile pour “${data.focusLabel}”.`
        : 'Cet élément est utile pour le travail en cours.'
    case 'blocked_as_distraction':
      return data?.focusLabel
        ? `Cet élément n’est pas nécessaire pour “${data.focusLabel}”.`
        : 'Cet élément est traité comme une distraction pour cette session.'
    case 'sleep_transition':
      return 'Ce moment est protégé pour la transition vers le sommeil.'
    case 'rest_protected':
      return 'Ce bloc protège une récupération nécessaire.'
    case 'work_or_school_preparation':
      return 'Ce moment est gardé pour préparer l’école ou le travail.'
    case 'active_objective':
      return 'L’objectif est actif.'
    case 'large_objective_scope':
      return 'L’objectif contient encore beaucoup de travail.'
    case 'useful_for_task':
      return 'Cet élément semble utile pour la tâche actuelle.'
    case 'not_required_for_session':
      return 'Cet élément n’est pas nécessaire pour la session actuelle.'
    case 'allowlist_missing':
      return 'Cet élément n’est pas dans la liste des outils nécessaires.'
    case 'protection_strong':
      return 'La protection est forte pour préserver le travail profond.'
    case 'media_control_required':
      return 'Un contrôle média est nécessaire pour éviter une distraction passive.'
  }
}

function humanReasonsForTags(
  tags: DecisionReasonTag[],
  data?: { objectiveName?: string; focusLabel?: string },
): string[] {
  return tags.map((tag) => reasonForTag(tag, data))
}

export function explainTaskDecision(
  task: Task,
  linkedObjective?: Objective | null,
  options: ExplainTaskDecisionOptions = {},
): DecisionExplanation {
  const todayStr = options.todayStr ?? localDateKey()
  const todayStartMinute = options.todayStartMinute ?? minutesSinceStartOfDay()
  const estimatedMinutes = task.estimatedMinutes ?? estimateMinutesForLevel(task.level)
  const remainingMinutes = task.remainingMinutes ?? estimatedMinutes
  const progress =
    estimatedMinutes > 0
      ? Math.max(0, Math.min(1, (estimatedMinutes - remainingMinutes) / estimatedMinutes))
      : 1
  const progressCoeff = progressCoefficient(estimatedMinutes, remainingMinutes)
  const complexityCoeff = complexityCoefficient(task)
  const deadline = taskDeadlineState(task, todayStr, todayStartMinute)
  const score = task.level * deadline.deadlineMultiplier * complexityCoeff * progressCoeff
  const complexity = taskComplexity(task)
  const almostCompleted = progress >= 0.85 || remainingMinutes <= 30

  const tags: DecisionReasonTag[] = []
  if (deadline.isOverdue) tags.push('deadline_overdue')
  else if (deadline.isToday) tags.push('deadline_today')
  else if (deadline.diffDays > 0 && deadline.diffDays <= 3) tags.push('deadline_soon')
  if (remainingMinutes >= 120 || remainingMinutes / Math.max(1, estimatedMinutes) >= 0.7) {
    tags.push('large_remaining_work')
  }
  if (complexity === 'hard' || complexity === 'extreme' || complexity === 'unknown') {
    tags.push('high_complexity')
  }
  if (progress < 0.25 && remainingMinutes > 30) tags.push('low_progress')
  if (almostCompleted) tags.push('almost_completed')
  if (linkedObjective) tags.push('linked_to_objective')
  if (linkedObjective && linkedObjective.level >= 6) tags.push('objective_high_level')
  if (task.blocking?.enabled || linkedObjective?.blocking?.enabled) tags.push('blocking_required')

  const reasonTags = uniqueTags(tags)
  const severity = severityFromScore({
    score,
    isOverdue: deadline.isOverdue,
    isToday: deadline.isToday,
    remainingMinutes,
    almostCompleted,
  })

  return {
    targetType: 'task',
    targetId: task.id,
    reasonTags,
    humanTitle: titleForSeverity(severity, task, almostCompleted),
    humanReasons: humanReasonsForTags(reasonTags, { objectiveName: linkedObjective?.name }),
    severity,
    confidence: confidenceFromSignals(reasonTags.length, Boolean(linkedObjective), true),
    debug: {
      score: Math.round(score * 10) / 10,
      deadlineMultiplier: deadline.deadlineMultiplier,
      complexityCoefficient: complexityCoeff,
      progressCoefficient: progressCoeff,
      remainingMinutes,
      estimatedMinutes,
    },
  }
}

export function explainPlanningBlock(
  block: PlacedBlock,
  task?: Task | null,
  objective?: Objective | null,
): DecisionExplanation {
  const blockMinutes = Math.max(0, block.endMinute - block.startMinute)

  if (block.kind === 'break') {
    return {
      targetType: 'planning_block',
      targetId: block.id,
      reasonTags: ['rest_protected'],
      humanTitle: 'Récupération protégée',
      humanReasons: humanReasonsForTags(['rest_protected']),
      severity: 'medium',
      confidence: 82,
      debug: { remainingMinutes: blockMinutes, estimatedMinutes: blockMinutes },
    }
  }

  const tags: DecisionReasonTag[] = []
  let base: DecisionExplanation | null = null

  if (task) {
    base = explainTaskDecision(task, objective)
    tags.push(...base.reasonTags)
    const remaining = base.debug?.remainingMinutes ?? 0
    if (blockMinutes >= Math.min(60, Math.max(30, remaining))) tags.push('good_time_slot')
    if (blockMinutes < 30 && base.reasonTags.includes('high_complexity')) tags.push('poor_time_slot')
  } else if (objective) {
    if (objective.level >= 6) tags.push('objective_high_level')
    if (objective.blocking?.enabled) tags.push('blocking_required')
    if (blockMinutes >= 45) tags.push('good_time_slot')
  } else if (block.kind === 'task' || block.kind === 'objective') {
    tags.push(blockMinutes >= 45 ? 'good_time_slot' : 'limited_free_time')
  }

  const reasonTags = uniqueTags(tags)
  const severity = base?.severity ?? (reasonTags.includes('poor_time_slot') ? 'medium' : 'low')
  const title =
    block.kind === 'objective'
      ? 'Objectif placé'
      : block.kind === 'task'
        ? base?.humanTitle ?? 'Tâche placée'
        : 'Bloc planifié'

  return {
    targetType: 'planning_block',
    targetId: block.id,
    reasonTags,
    humanTitle: title,
    humanReasons: humanReasonsForTags(reasonTags, { objectiveName: objective?.name }),
    severity,
    confidence: confidenceFromSignals(reasonTags.length, Boolean(objective), Boolean(base?.debug)),
    debug: {
      ...base?.debug,
      remainingMinutes: base?.debug?.remainingMinutes ?? blockMinutes,
    },
  }
}

export function explainBlockingDecision(
  subject: BlockingDecisionSubject,
  context: BlockingDecisionContext,
): DecisionExplanation {
  const tags: DecisionReasonTag[] = []
  if (context.sessionActive) tags.push('session_active')
  if (context.protectionLevel && context.protectionLevel >= 6) tags.push('blocking_required')
  if (context.allowed) tags.push('allowed_for_task')
  if (context.blocked) tags.push('blocked_as_distraction')
  if (context.mode === 'allowlist' && !context.allowed) tags.push('blocked_as_distraction')

  const reasonTags = uniqueTags(tags)
  const isBlocked = context.blocked || (context.mode === 'allowlist' && !context.allowed)

  return {
    targetType: subject.kind,
    targetId: subject.id,
    reasonTags,
    humanTitle: isBlocked ? 'Accès bloqué' : 'Accès autorisé',
    humanReasons: humanReasonsForTags(reasonTags, { focusLabel: context.focusLabel }),
    severity: isBlocked ? 'high' : 'low',
    confidence: confidenceFromSignals(reasonTags.length, false, false),
  }
}

export function decisionExplanationTitle(explanation: DecisionExplanation): string {
  const reasons = explanation.humanReasons.map((reason) => `- ${reason}`).join('\n')
  return `${explanation.humanTitle}${reasons ? `\n${reasons}` : ''}`
}
