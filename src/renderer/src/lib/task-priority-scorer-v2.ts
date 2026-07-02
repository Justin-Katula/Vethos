import type { CompletionGateResult } from '@shared/completion-gate'
import type { ObjectiveModelV2 } from '@shared/objective-model'
import type { PriorityScoreV2 } from '@shared/priority-score-model'
import { PRIORITY_SCORE_V2_MODEL_VERSION } from '@shared/priority-score-model'
import type { TaskModelV2 } from '@shared/task-model'
import type { UserCognitiveModel, UserModel } from '@shared/user-model'
import { buildPriorityScoreDimensions, type PriorityPlanningContext } from './priority-dimension-builder'
import { explainPriorityScore } from './priority-explanation-engine'
import { buildPriorityRecommendation } from './priority-recommendation-engine'
import { useSettingsStore } from '../store/settings.store'

export type ScoreTaskPriorityV2Input = {
  taskModelV2: TaskModelV2
  linkedObjectiveModelV2?: ObjectiveModelV2 | null
  userModel?: UserModel | null
  planningContext?: PriorityPlanningContext | null
  cognitiveModel?: UserCognitiveModel | null
  completionGateResult?: CompletionGateResult | null
  oldScore?: number
  now?: Date
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

function weightedScore(parts: Array<[number, number]>): number {
  return clampScore(parts.reduce((sum, [weight, score]) => sum + weight * score, 0))
}

function confidenceFrom(task: TaskModelV2, oldScore?: number): number {
  const signals = [
    task.purpose.importanceScore,
    100 - task.risk.ambiguityRiskScore,
    task.completionVerification.finalConfidence,
    task.appSiteContext.usefulApps.length + task.appSiteContext.usefulSites.length > 0 ? 75 : 45,
    oldScore !== undefined ? 70 : 45,
  ]
  return clampScore(signals.reduce((sum, score) => sum + score, 0) / signals.length)
}

export function scoreTaskPriorityV2(input: ScoreTaskPriorityV2Input): PriorityScoreV2 {
  const now = input.now ?? new Date()
  const task = input.taskModelV2
  const completion = input.completionGateResult ?? task.completionVerification
  const dimensions = buildPriorityScoreDimensions({
    targetType: 'task',
    taskModelV2: task,
    objectiveModelV2: input.linkedObjectiveModelV2,
    userModel: input.userModel,
    planningContext: input.planningContext,
    cognitiveModel: input.cognitiveModel,
    completionGateResult: completion,
    oldScore: input.oldScore,
    now,
  })

  let actionPriorityScore = weightedScore([
    [0.2, dimensions.urgencyScore],
    [0.17, dimensions.importanceScore],
    [0.13, dimensions.objectiveImpactScore],
    [0.12, dimensions.feasibilityScore],
    [0.1, dimensions.deadlinePressureScore],
    [0.09, dimensions.stagnationScore],
    [0.08, dimensions.avoidanceScore],
    [0.06, dimensions.momentumScore],
    [0.05, dimensions.cognitiveFitScore],
    [-0.08, dimensions.ambiguityPenalty],
    [-0.08, dimensions.overloadPenalty],
    [-0.05, dimensions.uncertaintyPenalty],
  ])
  let planningPriorityScore = weightedScore([
    [0.22, dimensions.urgencyScore],
    [0.18, dimensions.importanceScore],
    [0.14, dimensions.objectiveImpactScore],
    [0.13, dimensions.feasibilityScore],
    [0.12, dimensions.workloadPressureScore],
    [0.08, dimensions.stagnationScore],
    [0.07, dimensions.cognitiveFitScore],
    [-0.08, dimensions.ambiguityPenalty],
    [-0.08, dimensions.overloadPenalty],
  ])
  let protectionPriorityScore = weightedScore([
    [0.25, dimensions.protectionNeedScore],
    [0.16, dimensions.importanceScore],
    [0.14, dimensions.urgencyScore],
    [0.12, dimensions.avoidanceScore],
    [0.12, dimensions.workloadPressureScore],
    [0.1, dimensions.objectiveImpactScore],
    [0.07, dimensions.deadlinePressureScore],
    [0.04, dimensions.stagnationScore],
  ])
  let recoveryPriorityScore = weightedScore([
    [0.28, dimensions.stagnationScore],
    [0.25, dimensions.avoidanceScore],
    [0.15, dimensions.importanceScore],
    [0.12, dimensions.objectiveImpactScore],
    [0.1, dimensions.feasibilityScore],
    [0.05, dimensions.urgencyScore],
    [-0.1, dimensions.overloadPenalty],
    [-0.08, dimensions.ambiguityPenalty],
  ])

  if (completion.verifiedCompleted || task.identity.status === 'completed') {
    actionPriorityScore = 0
    planningPriorityScore = 0
    protectionPriorityScore = 0
    recoveryPriorityScore = 0
  }

  if (completion.decision === 'reject_completion') {
    recoveryPriorityScore = clampScore(recoveryPriorityScore + 15)
    actionPriorityScore = clampScore(actionPriorityScore + 8)
  }

  let totalScore = Math.max(actionPriorityScore, planningPriorityScore, recoveryPriorityScore * 0.9)
  if (task.identity.status === 'active') totalScore = Math.max(totalScore, protectionPriorityScore * 0.65)
  if (completion.verifiedCompleted || task.identity.status === 'completed') totalScore = 0
  totalScore = clampScore(totalScore)

  const confidence = confidenceFrom(task, input.oldScore)
  const recommendation = buildPriorityRecommendation({
    targetType: 'task',
    dimensions,
    scores: {
      totalScore,
      actionPriorityScore,
      planningPriorityScore,
      protectionPriorityScore,
      recoveryPriorityScore,
    },
    suggestedDurationMinutes: task.session.recommendedSessionMinutes,
    isCompleted: task.identity.status === 'completed',
    completionVerified: completion.verifiedCompleted,
    completionClaimed: completion.userClaimedCompleted,
    completionRejected: completion.decision === 'reject_completion',
    nextStepKind: task.nextStep.kind,
    confidence,
  })

  const scoreWithoutExplanation: PriorityScoreV2 = {
    targetType: 'task',
    targetId: task.identity.id,
    totalScore,
    actionPriorityScore,
    planningPriorityScore,
    protectionPriorityScore,
    recoveryPriorityScore,
    dimensions,
    recommendation,
    explanation: {
      title: '',
      summary: '',
      reasons: [],
      warnings: [],
    },
    confidence,
    metadata: {
      modelVersion: PRIORITY_SCORE_V2_MODEL_VERSION,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      source: 'task_model_v2',
      shadowOnly: useSettingsStore.getState?.()?.engineV2Priority !== true,
      debug: {
        oldScore: input.oldScore,
        priorityV2ControlsRealSorting: useSettingsStore.getState?.()?.engineV2Priority === true,
        priorityV2ControlsRealPlanning: useSettingsStore.getState?.()?.engineV2Placement === true,
        priorityV2ControlsRealBlocking: useSettingsStore.getState?.()?.engineV2Blocking === true,
      },
    },
  }

  return {
    ...scoreWithoutExplanation,
    explanation: explainPriorityScore(scoreWithoutExplanation),
  }
}
