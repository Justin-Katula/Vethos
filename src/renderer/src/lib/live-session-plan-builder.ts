import type { PlacementPlanV2, ProposedPlacementBlock } from '@shared/placement-model'
import type { PlanningContextV2 } from '@shared/planning-time-model'
import type { Objective, RegistryItem, Task } from '@shared/schemas'
import type { UserModel } from '@shared/user-model'
import { buildDeadlineCrisisContext } from './deadline-crisis-context-engine'
import { calculateUsableTimeBeforeDeadline } from './deadline-availability-engine'
import { buildObjectiveModelV2 } from './objective-model-builder'
import { scoreObjectivePriorityV2 } from './objective-priority-scorer-v2'
import { selectPrimaryObjectiveId } from './priority-engine'
import { buildSessionPlanV2 } from './session-plan-builder'
import { buildTaskModelV2 } from './task-model-builder'
import { scoreTaskPriorityV2 } from './task-priority-scorer-v2'

export function buildLiveSessionPlan(input: {
  userId: string
  placementBlock: ProposedPlacementBlock
  placementPlanV2?: PlacementPlanV2
  tasks: Task[]
  objectives: Objective[]
  registry: RegistryItem[]
  userModel?: UserModel | null
  planningContext?: PlanningContextV2
  now: Date
  idFactory?: () => string
}) {
  const primaryObjectiveId = selectPrimaryObjectiveId(input.objectives, input.userModel)
  const objectiveModels = input.objectives.map((objective) => buildObjectiveModelV2({
    objective,
    linkedTasks: input.tasks.filter((task) => task.linkedObjectiveId === objective.id),
    registry: input.registry,
    userModel: input.userModel,
    planningContext: input.planningContext ? {
      usableFreeMinutes: input.planningContext.weeklySummary.usableFreeMinutes,
    } : undefined,
    now: input.now,
    priorityContext: { primaryObjectiveId },
  }))
  const objectiveById = new Map(objectiveModels.map((model) => [model.identity.id, model]))
  const taskModels = input.tasks.map((task) => buildTaskModelV2({
    task,
    objective: task.linkedObjectiveId
      ? input.objectives.find((objective) => objective.id === task.linkedObjectiveId) ?? null
      : null,
    objectiveModel: task.linkedObjectiveId ? objectiveById.get(task.linkedObjectiveId) ?? null : null,
    registry: input.registry,
    userModel: input.userModel,
    now: input.now,
    priorityContext: { primaryObjectiveId },
  }))
  const taskScores = taskModels.map((taskModel) => scoreTaskPriorityV2({
    taskModelV2: taskModel,
    linkedObjectiveModelV2: taskModel.identity.linkedObjectiveId
      ? objectiveById.get(taskModel.identity.linkedObjectiveId) ?? null
      : null,
    userModel: input.userModel,
    planningContext: null,
    cognitiveModel: input.userModel?.cognitiveModel ?? null,
    completionGateResult: taskModel.completionVerification,
    now: input.now,
  }))
  const objectiveScores = objectiveModels.map((objectiveModel) => scoreObjectivePriorityV2({
    objectiveModelV2: objectiveModel,
    linkedTaskScores: taskScores.filter((score) => {
      const task = input.tasks.find((candidate) => candidate.id === score.targetId)
      return task?.linkedObjectiveId === objectiveModel.identity.id
    }),
    userModel: input.userModel,
    planningContext: null,
    cognitiveModel: input.userModel?.cognitiveModel ?? null,
    now: input.now,
  }))

  const targetTaskId = input.placementBlock.targetType === 'task'
    ? input.placementBlock.targetId
    : input.placementBlock.linkedTaskId
  const targetTask = targetTaskId ? input.tasks.find((task) => task.id === targetTaskId) : undefined
  const targetTaskModel = targetTaskId ? taskModels.find((model) => model.identity.id === targetTaskId) : undefined
  const targetTaskScore = targetTaskId ? taskScores.find((score) => score.targetId === targetTaskId) : undefined
  const deadlineCrisisContexts = targetTask && targetTaskModel && input.planningContext
    ? [buildDeadlineCrisisContext({
        targetType: 'task',
        targetId: targetTask.id,
        deadline: targetTask.deadline,
        progressPercent: targetTaskModel.progress.progressPercent,
        remainingMinutes: targetTaskModel.workload.remainingMinutes,
        requiredIdealMinutes: targetTaskModel.workload.remainingMinutes,
        deadlineAvailability: calculateUsableTimeBeforeDeadline({
          deadline: targetTask.deadline,
          planningContext: input.planningContext,
          taskSessionProfile: {
            estimatedMinutes: targetTaskModel.workload.remainingMinutes,
            minimumUsefulMinutes: targetTaskModel.session.minimumUsefulSessionMinutes,
            requiresDeepWork: targetTaskModel.session.shouldUseDeepWorkBlock,
          },
          now: input.now,
        }),
        planningContext: input.planningContext,
        priorityScoreV2: targetTaskScore,
        userModel: input.userModel,
        now: input.now,
      })]
    : []

  return buildSessionPlanV2({
    userId: input.userId,
    placementBlock: input.placementBlock,
    placementPlanV2: input.placementPlanV2,
    taskModelsV2: taskModels,
    objectiveModelsV2: objectiveModels,
    priorityScoresV2: [...taskScores, ...objectiveScores],
    planningContext: input.planningContext,
    deadlineCrisisContexts,
    userModel: input.userModel,
    now: input.now.toISOString(),
    idFactory: input.idFactory,
  })
}
