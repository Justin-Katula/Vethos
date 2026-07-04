import type {
  ExecutionPreviewSanitizedSnapshot,
  ProposedPipelineBuildMode,
  ProposedPipelineBuildResult,
} from '@shared/execution-preview-data-connector-model'
import type { ObjectiveModelV2 } from '@shared/objective-model'
import type { PlanningContextV2 } from '@shared/planning-time-model'
import type { PlacementPlanV2 } from '@shared/placement-model'
import type { RuntimeCoordinatorPlanV2 } from '@shared/runtime-coordinator-model'
import type { Objective, RegistryItem, ScheduleEntry, Settings, Task, TimeRule } from '@shared/schemas'
import type { SessionPlanV2 } from '@shared/session-model'
import type { TaskModelV2 } from '@shared/task-model'
import type { UserModel } from '@shared/user-model'
import { calculateUsableTimeBeforeDeadline } from './deadline-availability-engine'
import { buildDeadlineCrisisContext } from './deadline-crisis-context-engine'
import { buildExecutionPreviewPlanV2 } from './execution-preview-plan-builder'
import type { ExecutionPreviewInputPayload } from './execution-preview-input-adapter'
import type { ExecutionPreviewSessionSnapshot } from './execution-preview-session-normalizer'
import { buildObjectiveModelV2 } from './objective-model-builder'
import { scoreObjectivePriorityV2 } from './objective-priority-scorer-v2'
import { buildPlacementPlanV2 } from './placement-plan-builder'
import { buildPlanningContextV2 } from './planning-context-snapshot'
import { buildRuntimeCoordinatorPlanV2 } from './runtime-coordinator-plan-builder'
import { buildSessionPlanV2 } from './session-plan-builder'
import { scoreTaskPriorityV2 } from './task-priority-scorer-v2'
import { buildTaskModelV2 } from './task-model-builder'

export type ProposedPipelineInput = {
  snapshot: ExecutionPreviewSanitizedSnapshot
  now?: string
  idFactory?: () => string
  builders?: {
    buildPreviewPlan?: ((input: ExecutionPreviewInputPayload) => ReturnType<typeof buildExecutionPreviewPlanV2>) | null
  }
}

export function runExecutionPreviewProposedPipeline(
  input: ProposedPipelineInput,
): ProposedPipelineBuildResult {
  const { snapshot } = input
  const warnings = [...snapshot.warnings]
  const errors: string[] = []
  let confidence = snapshot.confidence
  let partial = false

  if (snapshot.userId === 'MISSING_USER_ID') {
    return failure('unsafe', 'Impossible de construire la preview : userId manquant.', warnings)
  }

  const now = validDate(input.now) ?? new Date()
  const tasks = snapshot.tasks.filter(isTaskLike) as Task[]
  const objectives = snapshot.objectives.filter(isObjectiveLike) as Objective[]
  const registry = [...snapshot.apps, ...snapshot.sites].filter(isRecord) as RegistryItem[]
  const sessions = snapshot.sessions.filter(isRecord) as ExecutionPreviewSessionSnapshot[]
  const userModel = isRecord(snapshot.userModel) ? snapshot.userModel as UserModel : undefined
  const settings = isRecord(snapshot.settings) ? snapshot.settings as Settings : undefined

  let planningContextV2: PlanningContextV2 | undefined
  try {
    const rules = snapshot.schedules.filter(isTimeRuleLike) as TimeRule[]
    const entries = snapshot.schedules.filter(isScheduleEntryLike) as ScheduleEntry[]
    planningContextV2 = buildPlanningContextV2({
      userId: snapshot.userId,
      dateRange: snapshot.dateRange,
      schedule: { rules, entries },
      sessions: sessions.flatMap((session) => session.start && session.end ? [{
        id: session.id,
        label: session.label,
        start: session.start,
        end: session.end,
        locked: session.locked,
      }] : []),
      userModel,
      cognitiveModel: userModel?.cognitiveModel,
      settings,
      now,
    })
  } catch (error) {
    partial = true
    errors.push(stageError('planning_context_v2', error))
  }

  const objectiveModelsV2: ObjectiveModelV2[] = []
  for (const objective of objectives) {
    try {
      objectiveModelsV2.push(buildObjectiveModelV2({
        objective,
        linkedTasks: tasks.filter((task) => task.linkedObjectiveId === objective.id),
        sessions,
        userModel,
        registry,
        planningContext: planningContextV2 ? {
          usableFreeMinutes: planningContextV2.weeklySummary.usableFreeMinutes,
          dailyCapacityMinutes: planningContextV2.days.length > 0
            ? Math.round(planningContextV2.weeklySummary.usableFreeMinutes / planningContextV2.days.length)
            : 0,
        } : undefined,
        now,
      }))
    } catch (error) {
      partial = true
      errors.push(stageError(`objective_model_v2:${objective.id}`, error))
    }
  }

  const objectiveById = new Map(objectiveModelsV2.map((model) => [model.identity.id, model]))
  const objectiveSourceById = new Map(objectives.map((objective) => [objective.id, objective]))
  const taskModelsV2: TaskModelV2[] = []
  for (const task of tasks) {
    try {
      taskModelsV2.push(buildTaskModelV2({
        task,
        objective: task.linkedObjectiveId ? objectiveSourceById.get(task.linkedObjectiveId) ?? null : null,
        objectiveModel: task.linkedObjectiveId ? objectiveById.get(task.linkedObjectiveId) ?? null : null,
        sessions,
        userModel,
        registry,
        now,
      }))
    } catch (error) {
      partial = true
      errors.push(stageError(`task_model_v2:${task.id}`, error))
    }
  }

  // Point 5 (B.2) : les scoreurs reçoivent désormais les flags d'activation en
  // entrée (amendement B.4), donc on peut calculer les vrais PriorityScoreV2 ici
  // sans lire le store. Le pipeline reste pur.
  const engineActivation = {
    engineV2Priority: settings?.engineV2Priority ?? true,
    engineV2Placement: settings?.engineV2Placement ?? true,
    engineV2Blocking: settings?.engineV2Blocking ?? true,
  }
  const objectiveByIdForScoring = new Map(objectiveModelsV2.map((m) => [m.identity.id, m]))
  const taskPriorityScores = taskModelsV2.map((taskModel) => {
    try {
      return scoreTaskPriorityV2({
        taskModelV2: taskModel,
        linkedObjectiveModelV2: taskModel.identity.linkedObjectiveId
          ? objectiveByIdForScoring.get(taskModel.identity.linkedObjectiveId) ?? null
          : null,
        userModel,
        planningContext: null,
        cognitiveModel: userModel?.cognitiveModel ?? null,
        completionGateResult: taskModel.completionVerification,
        now,
        engineActivation,
      })
    } catch (error) {
      partial = true
      errors.push(stageError(`priority_score:${taskModel.identity.id}`, error))
      return null
    }
  }).filter((s): s is NonNullable<typeof s> => s !== null)

  const priorityScoresV2 = [
    ...taskPriorityScores,
    ...objectiveModelsV2.map((objectiveModel) => {
      const linkedTaskScores = taskPriorityScores.filter((score) => {
        const taskModel = taskModelsV2.find((m) => m.identity.id === score.targetId)
        return taskModel?.identity.linkedObjectiveId === objectiveModel.identity.id
      })
      try {
        return scoreObjectivePriorityV2({
          objectiveModelV2: objectiveModel,
          linkedTaskScores,
          userModel,
          planningContext: null,
          cognitiveModel: userModel?.cognitiveModel ?? null,
          now,
          engineActivation,
        })
      } catch (error) {
        partial = true
        errors.push(stageError(`priority_score:${objectiveModel.identity.id}`, error))
        return null
      }
    }).filter((s): s is NonNullable<typeof s> => s !== null),
  ]

  const deadlineCrisisContexts = planningContextV2
    ? taskModelsV2.flatMap((taskModel) => {
        try {
          const deadlineAvailability = calculateUsableTimeBeforeDeadline({
            deadline: taskModel.urgency.deadline,
            planningContext: planningContextV2!,
            taskSessionProfile: {
              estimatedMinutes: taskModel.workload.remainingMinutes,
              minimumUsefulMinutes: taskModel.session.minimumUsefulSessionMinutes,
              requiresDeepWork: taskModel.session.shouldUseDeepWorkBlock,
            },
            now,
          })
          return [buildDeadlineCrisisContext({
            targetType: 'task',
            targetId: taskModel.identity.id,
            deadline: taskModel.urgency.deadline,
            progressPercent: taskModel.progress.progressPercent,
            remainingMinutes: taskModel.workload.remainingMinutes,
            requiredIdealMinutes: taskModel.workload.remainingMinutes,
            deadlineAvailability,
            planningContext: planningContextV2!,
            userModel,
            now,
          })]
        } catch (error) {
          partial = true
          errors.push(stageError(`deadline_crisis_context:${taskModel.identity.id}`, error))
          return []
        }
      })
    : []

  let placementPlanV2: PlacementPlanV2 | undefined
  if (planningContextV2) {
    try {
      placementPlanV2 = buildPlacementPlanV2({
        userId: snapshot.userId,
        dateRange: snapshot.dateRange,
        planningContext: {
          usableFreeWindows: planningContextV2.days.flatMap((day) => day.freeWindows).map((window) => ({
            id: window.id,
            start: window.start,
            end: window.end,
            usableDurationMinutes: window.usableDurationMinutes,
            canHostTask: window.canHostTask,
            canHostDeepWork: window.canHostDeepWork,
            windowType: window.windowType === 'deep_work'
              ? 'normal' as const
              : window.windowType === 'unknown'
                ? 'unsafe' as const
                : window.windowType,
          })),
        },
        taskModelsV2: taskModelsV2.map(toPlacementTask),
        objectiveModelsV2: objectiveModelsV2.map((model) => ({
          id: model.identity.id,
          title: model.identity.title,
          status: model.status.isCompleted ? 'completed' : 'active',
          hasClearNextAction: model.nextAction.suggestedActionType !== 'review_objective',
        })),
        priorityScoresV2: [],
        deadlineCrisisContexts: deadlineCrisisContexts.map((context) => ({
          targetId: context.targetId,
          crisisLevel: context.crisisLevel,
          recommendedMode: context.recommendedMode,
        })),
        userModel,
        now: now.toISOString(),
        idFactory: input.idFactory,
      })
    } catch (error) {
      partial = true
      errors.push(stageError('placement_plan_v2', error))
    }
  }

  const sessionPlansV2: SessionPlanV2[] = []
  for (const block of placementPlanV2?.proposedBlocks ?? []) {
    try {
      sessionPlansV2.push(buildSessionPlanV2({
        userId: snapshot.userId,
        placementBlock: block,
        placementPlanV2,
        taskModelsV2,
        objectiveModelsV2,
        priorityScoresV2,
        planningContext: planningContextV2,
        deadlineCrisisContexts,
        userModel,
        now: now.toISOString(),
        idFactory: input.idFactory,
      }))
    } catch (error) {
      partial = true
      errors.push(stageError(`session_plan_v2:${block.id}`, error))
    }
  }

  const runtimeCoordinatorPlansV2: RuntimeCoordinatorPlanV2[] = []
  for (const sessionPlan of sessionPlansV2) {
    try {
      runtimeCoordinatorPlansV2.push(buildRuntimeCoordinatorPlanV2({
        userId: snapshot.userId,
        sessionPlan,
        now: now.toISOString(),
        idFactory: input.idFactory,
      }))
    } catch (error) {
      partial = true
      errors.push(stageError(`runtime_coordinator_plan_v2:${sessionPlan.id}`, error))
    }
  }

  try {
    const previewBuilder = input.builders
      ? input.builders.buildPreviewPlan
      : buildExecutionPreviewPlanV2
    if (!previewBuilder) {
      errors.push('execution_preview_plan_v2: builder indisponible')
      return {
        mode: 'partial_preview', userModel, objectiveModelsV2, taskModelsV2, priorityScoresV2,
        planningContextV2, placementPlanV2, sessionPlansV2, runtimeCoordinatorPlansV2,
        warnings, errors, confidence: Math.max(0, confidence - 40), canApplyPreview: false,
      }
    }
    const previewPlan = previewBuilder({
      userId: snapshot.userId,
      dateRange: snapshot.dateRange,
      userModel,
      objectiveModelsV2,
      taskModelsV2,
      priorityScoresV2,
      planningContextV2,
      placementPlanV2,
      sessionPlansV2,
      runtimeCoordinatorPlansV2,
      settings,
      now: now.toISOString(),
      idFactory: input.idFactory,
    })
    if (previewPlan.readiness.canApplyLater !== false) {
      return failure('unsafe', 'Le plan généré viole la garantie canApplyLater=false.', warnings)
    }

    confidence = Math.min(confidence, previewPlan.confidence)
    const unsafe = previewPlan.mode === 'unsafe' || previewPlan.safety.status === 'critical'
    const mode: ProposedPipelineBuildMode = unsafe
      ? 'unsafe'
      : partial || errors.length > 0 || previewPlan.status === 'partial_preview'
        ? 'partial_preview'
        : previewPlan.mode === 'manual_review_required'
          ? 'manual_review_required'
          : 'preview_only'
    return {
      mode,
      previewPlan,
      userModel,
      objectiveModelsV2,
      taskModelsV2,
      priorityScoresV2,
      planningContextV2,
      placementPlanV2,
      sessionPlansV2,
      runtimeCoordinatorPlansV2,
      warnings,
      errors,
      confidence: Math.max(0, confidence - (partial ? 15 : 0)),
      canApplyPreview: false,
    }
  } catch (error) {
    errors.push(stageError('execution_preview_plan_v2', error))
    return {
      mode: 'partial_preview',
      userModel,
      objectiveModelsV2,
      taskModelsV2,
      priorityScoresV2,
      planningContextV2,
      placementPlanV2,
      sessionPlansV2,
      runtimeCoordinatorPlansV2,
      warnings,
      errors,
      confidence: Math.max(0, confidence - 40),
      canApplyPreview: false,
    }
  }
}

function failure(
  mode: ProposedPipelineBuildMode,
  message: string,
  warnings: string[],
): ProposedPipelineBuildResult {
  return { mode, warnings, errors: [message], confidence: 0, canApplyPreview: false }
}

function stageError(stage: string, error: unknown): string {
  return `${stage}: ${error instanceof Error ? error.message : String(error)}`
}

function validDate(value: string | undefined): Date | undefined {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isTaskLike(value: unknown): boolean {
  return isRecord(value) && typeof value.id === 'string' && typeof value.title === 'string' && typeof value.deadline === 'string'
}

function isObjectiveLike(value: unknown): boolean {
  return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string'
}

function isTimeRuleLike(value: unknown): boolean {
  return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string' && !('ruleId' in value)
}

function isScheduleEntryLike(value: unknown): boolean {
  return isRecord(value) && typeof value.id === 'string' && typeof value.ruleId === 'string'
}

function toPlacementTask(model: TaskModelV2) {
  const next = model.nextStep.kind
  return {
    id: model.identity.id,
    title: model.identity.title,
    status: model.identity.status === 'completed' || model.identity.status === 'expired'
      ? model.identity.status
      : 'active' as const,
    recommendedAction: next === 'split_task' ? 'split_first' as const : next === 'clarify_task' ? 'clarify' as const : 'do' as const,
    progressPercent: model.progress.progressPercent,
    remainingMinutes: model.workload.remainingMinutes,
    estimatedMinutes: model.workload.estimatedMinutes,
    requiresDeepWork: model.session.shouldUseDeepWorkBlock,
    deadline: model.urgency.deadline,
    isVague: next === 'clarify_task',
  }
}
