import type { ObjectiveModelV2 } from '@shared/objective-model'
import type { PlacementPlanV2, ProposedPlacementBlock } from '@shared/placement-model'
import type { PlanningContextV2, DeadlineCrisisContext } from '@shared/planning-time-model'
import type { PriorityScoreV2 } from '@shared/priority-score-model'
import type { SessionTargetType } from '@shared/session-model'
import type { TaskModelV2 } from '@shared/task-model'
import type { UserModel } from '@shared/user-model'
import type {
  AnyDeadlineCrisisContext,
  AnyObjectiveModel,
  AnyPriorityScore,
  AnyTaskModel,
} from './placement-input-adapter'

export type SessionTaskModel = (TaskModelV2 & { id?: string; title?: string }) | AnyTaskModel
export type SessionObjectiveModel = (ObjectiveModelV2 & { id?: string; title?: string }) | AnyObjectiveModel
export type SessionPriorityScore = PriorityScoreV2 | AnyPriorityScore
export type SessionDeadlineCrisisContext = DeadlineCrisisContext | AnyDeadlineCrisisContext

export interface BuildSessionInputParams {
  placementBlock: ProposedPlacementBlock
  placementPlanV2?: PlacementPlanV2
  taskModelsV2?: SessionTaskModel[]
  objectiveModelsV2?: SessionObjectiveModel[]
  priorityScoresV2?: SessionPriorityScore[]
  planningContext?: PlanningContextV2
  deadlineCrisisContexts?: SessionDeadlineCrisisContext[]
  userModel?: UserModel | null
  now?: string
}

export interface SessionAppSiteContext {
  usefulApps: string[]
  usefulSites: string[]
  distractingApps: string[]
  distractingSites: string[]
  conditionalApps: string[]
  conditionalSites: string[]
}

export interface SessionInputData {
  targetType: SessionTargetType
  targetId: string
  linkedTask?: SessionTaskModel
  linkedObjective?: SessionObjectiveModel
  priorityScore?: SessionPriorityScore
  deadlineCrisisContext?: SessionDeadlineCrisisContext
  placementPlanV2?: PlacementPlanV2
  planningContext?: PlanningContextV2
  userModel?: UserModel | null
  appSiteContext?: SessionAppSiteContext
  placementBlock: ProposedPlacementBlock
  targetFound?: boolean
  requiresManualReview?: boolean
  warnings: string[]
  confidence: number
}

function clampScore(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)))
}

export function sessionTaskId(task: SessionTaskModel): string {
  return 'identity' in task ? task.identity.id : task.id
}

export function sessionTaskTitle(task: SessionTaskModel | undefined): string | undefined {
  if (!task) return undefined
  return 'identity' in task ? task.identity.title : task.title
}

export function sessionObjectiveId(objective: SessionObjectiveModel): string {
  return 'identity' in objective ? objective.identity.id : objective.id
}

export function sessionObjectiveTitle(objective: SessionObjectiveModel | undefined): string | undefined {
  if (!objective) return undefined
  return 'identity' in objective ? objective.identity.title : objective.title
}

export function sessionPriorityTotal(score: SessionPriorityScore | undefined): number {
  if (!score) return 0
  return 'totalScore' in score ? score.totalScore : score.priorityScore
}

export function sessionPriorityUrgency(score: SessionPriorityScore | undefined): string | undefined {
  if (!score) return undefined
  return 'recommendation' in score ? score.recommendation.urgencyLabel : score.urgencyLevel
}

export function sessionPriorityProtection(score: SessionPriorityScore | undefined): number {
  if (!score) return 0
  return 'dimensions' in score
    ? score.dimensions.protectionNeedScore
    : score.protectionPriorityScore ?? 0
}

function taskAppSiteContext(task: SessionTaskModel | undefined): SessionAppSiteContext {
  if (!task || !('appSiteContext' in task)) {
    return {
      usefulApps: [], usefulSites: [], distractingApps: [], distractingSites: [],
      conditionalApps: [], conditionalSites: [],
    }
  }
  return {
    usefulApps: task.appSiteContext.usefulApps,
    usefulSites: task.appSiteContext.usefulSites,
    distractingApps: task.appSiteContext.distractingApps,
    distractingSites: task.appSiteContext.distractingSites,
    conditionalApps: task.appSiteContext.unknownApps,
    conditionalSites: task.appSiteContext.unknownSites,
  }
}

function mergeAppSiteContext(
  task: SessionTaskModel | undefined,
  objective: SessionObjectiveModel | undefined,
  userModel: UserModel | null | undefined,
): SessionAppSiteContext {
  const taskContext = taskAppSiteContext(task)
  const objectiveProtection = objective && 'protection' in objective ? objective.protection : undefined
  const taskId = task ? sessionTaskId(task) : undefined
  const objectiveId = objective ? sessionObjectiveId(objective) : undefined
  const preferences = userModel?.appSitePreferences.flatMap((preference) =>
    preference.contextRules
      .filter((rule) =>
        (rule.contextType === 'task' && rule.contextId === taskId) ||
        (rule.contextType === 'objective' && rule.contextId === objectiveId),
      )
      .map((rule) => ({ preference, rule })),
  ) ?? []
  const by = (kind: 'app' | 'site', classification: 'useful' | 'distraction' | 'conditional') =>
    preferences
      .filter(({ preference, rule }) => preference.kind === kind && rule.classification === classification)
      .map(({ preference }) => preference.identifier)

  return {
    usefulApps: unique([...taskContext.usefulApps, ...(objectiveProtection?.usefulApps ?? []), ...by('app', 'useful')]),
    usefulSites: unique([...taskContext.usefulSites, ...(objectiveProtection?.usefulSites ?? []), ...by('site', 'useful')]),
    distractingApps: unique([...taskContext.distractingApps, ...(objectiveProtection?.distractingApps ?? []), ...by('app', 'distraction')]),
    distractingSites: unique([...taskContext.distractingSites, ...(objectiveProtection?.distractingSites ?? []), ...by('site', 'distraction')]),
    conditionalApps: unique([...taskContext.conditionalApps, ...by('app', 'conditional')]),
    conditionalSites: unique([...taskContext.conditionalSites, ...by('site', 'conditional')]),
  }
}

export function buildSessionInputFromPlacement(input: BuildSessionInputParams): SessionInputData {
  const warnings: string[] = []
  const { placementBlock } = input
  let confidence = clampScore(placementBlock.confidence)
  let targetType = placementBlock.targetType as SessionTargetType

  if (!['task', 'objective', 'strategy_block'].includes(targetType)) {
    warnings.push('Le type de cible du bloc est invalide; une revue manuelle est requise.')
    targetType = 'strategy_block'
    confidence -= 30
  }

  const taskId = targetType === 'task'
    ? placementBlock.linkedTaskId ?? placementBlock.targetId
    : placementBlock.linkedTaskId
  const linkedTask = taskId
    ? (input.taskModelsV2 ?? []).find((task) => sessionTaskId(task) === taskId)
    : undefined
  const linkedObjective = targetType === 'objective'
    ? (input.objectiveModelsV2 ?? []).find((objective) => sessionObjectiveId(objective) === placementBlock.targetId)
    : placementBlock.linkedObjectiveId
      ? (input.objectiveModelsV2 ?? []).find((objective) => sessionObjectiveId(objective) === placementBlock.linkedObjectiveId)
      : undefined

  const targetFound = targetType === 'strategy_block'
    ? Boolean(placementBlock.targetId)
    : targetType === 'task'
      ? Boolean(linkedTask)
      : Boolean(linkedObjective)

  if (!targetFound) {
    warnings.push(`${targetType === 'task' ? 'Tâche' : 'Objectif'} cible introuvable pour ce bloc.`)
    confidence -= 45
  }
  if (!placementBlock.targetId) {
    warnings.push('Le bloc ne contient aucun identifiant de cible.')
    confidence -= 50
  }
  if (!Number.isFinite(placementBlock.durationMinutes) || placementBlock.durationMinutes <= 0) {
    warnings.push('Le bloc proposé a une durée invalide.')
    confidence -= 50
  }

  if (input.placementPlanV2 && !input.placementPlanV2.proposedBlocks.some((block) => block.id === placementBlock.id)) {
    warnings.push('Le bloc ne figure pas dans le PlacementPlanV2 fourni.')
    confidence -= 15
  }
  if (input.planningContext && !input.planningContext.days.some((day) => day.date === placementBlock.date)) {
    warnings.push('Le contexte de planification ne couvre pas la date de la session.')
    confidence -= 10
  }

  const scoreTargetId = linkedTask ? sessionTaskId(linkedTask) : placementBlock.targetId
  const priorityScore = (input.priorityScoresV2 ?? []).find((score) => score.targetId === scoreTargetId)
  const deadlineCrisisContext = (input.deadlineCrisisContexts ?? []).find((context) => context.targetId === scoreTargetId)
  const appSiteContext = mergeAppSiteContext(linkedTask, linkedObjective, input.userModel)
  const requiresManualReview = !targetFound || confidence < 50 || placementBlock.durationMinutes <= 0

  return {
    targetType,
    targetId: placementBlock.targetId,
    linkedTask,
    linkedObjective,
    priorityScore,
    deadlineCrisisContext,
    placementPlanV2: input.placementPlanV2,
    planningContext: input.planningContext,
    userModel: input.userModel,
    appSiteContext,
    placementBlock,
    targetFound,
    requiresManualReview,
    warnings,
    confidence: clampScore(confidence),
  }
}
