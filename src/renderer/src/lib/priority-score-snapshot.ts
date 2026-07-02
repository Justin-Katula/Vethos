import type { CompletionGateResult } from '@shared/completion-gate'
import type { ObjectiveModelV2 } from '@shared/objective-model'
import type { PriorityScoreSnapshot } from '@shared/priority-score-model'
import { PRIORITY_SCORE_V2_MODEL_VERSION } from '@shared/priority-score-model'
import type { TaskModelV2 } from '@shared/task-model'
import type { UserCognitiveModel, UserModel } from '@shared/user-model'
import type { PriorityPlanningContext } from './priority-dimension-builder'
import { scoreObjectivePriorityV2 } from './objective-priority-scorer-v2'
import { compareOldAndNewPriorityScore } from './priority-score-comparison'
import { rankPriorityItemsV2 } from './priority-ranking-engine-v2'
import { runPriorityScoreDiagnostics } from './priority-diagnostics'
import { scoreTaskPriorityV2 } from './task-priority-scorer-v2'

export type BuildPriorityScoreSnapshotInput = {
  taskModelsV2: TaskModelV2[]
  objectiveModelsV2: ObjectiveModelV2[]
  userModel?: UserModel | null
  planningContext?: PriorityPlanningContext | null
  cognitiveModel?: UserCognitiveModel | null
  completionGateResults?: CompletionGateResult[]
  oldScores?: Record<string, number>
  now?: Date
}

export function buildPriorityScoreSnapshot(input: BuildPriorityScoreSnapshotInput): PriorityScoreSnapshot {
  const now = input.now ?? new Date()
  const objectiveById = new Map(input.objectiveModelsV2.map((objective) => [objective.identity.id, objective]))
  const completionByTaskId = new Map((input.completionGateResults ?? []).map((result) => [result.taskId, result]))
  const taskScores = input.taskModelsV2.map((taskModel) => {
    return scoreTaskPriorityV2({
      taskModelV2: taskModel,
      linkedObjectiveModelV2: taskModel.identity.linkedObjectiveId ? objectiveById.get(taskModel.identity.linkedObjectiveId) : null,
      userModel: input.userModel,
      planningContext: input.planningContext,
      cognitiveModel: input.cognitiveModel,
      completionGateResult: completionByTaskId.get(taskModel.identity.id),
      oldScore: input.oldScores?.[taskModel.identity.id],
      now,
    })
  })
  const tasksByObjective = new Map<string, typeof taskScores>()
  for (const score of taskScores) {
    const task = input.taskModelsV2.find((model) => model.identity.id === score.targetId)
    const objectiveId = task?.identity.linkedObjectiveId
    if (!objectiveId) continue
    const current = tasksByObjective.get(objectiveId) ?? []
    current.push(score)
    tasksByObjective.set(objectiveId, current)
  }
  const objectiveScores = input.objectiveModelsV2.map((objectiveModel) => {
    return scoreObjectivePriorityV2({
      objectiveModelV2: objectiveModel,
      linkedTaskScores: tasksByObjective.get(objectiveModel.identity.id) ?? [],
      userModel: input.userModel,
      planningContext: input.planningContext,
      cognitiveModel: input.cognitiveModel,
      oldScore: input.oldScores?.[objectiveModel.identity.id],
      now,
    })
  })
  const comparisons = [...taskScores, ...objectiveScores].map((score) =>
    compareOldAndNewPriorityScore(input.oldScores?.[score.targetId], score),
  )
  const rankings = {
    action: rankPriorityItemsV2({ tasks: taskScores, objectives: objectiveScores }, { mode: 'action', now }),
    planning: rankPriorityItemsV2({ tasks: taskScores, objectives: objectiveScores }, { mode: 'planning', now }),
    protection: rankPriorityItemsV2({ tasks: taskScores, objectives: objectiveScores }, { mode: 'protection', now }),
    recovery: rankPriorityItemsV2({ tasks: taskScores, objectives: objectiveScores }, { mode: 'recovery', now }),
  }
  const diagnostics = runPriorityScoreDiagnostics({ taskScores, objectiveScores, comparisons })

  return {
    taskScores,
    objectiveScores,
    rankings,
    comparisons,
    diagnostics,
    metadata: {
      shadowOnly: true,
      createdAt: now.toISOString(),
      modelVersion: PRIORITY_SCORE_V2_MODEL_VERSION,
      debug: {
        priorityV2ControlsRealUi: false,
        priorityV2ControlsRealSorting: false,
        priorityV2ControlsRealPlanning: false,
        priorityV2ControlsRealBlocking: false,
      },
    },
  }
}
