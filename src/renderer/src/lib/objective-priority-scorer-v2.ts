import type { ObjectiveModelV2 } from '@shared/objective-model'
import type { PriorityScoreV2 } from '@shared/priority-score-model'
import { PRIORITY_SCORE_V2_MODEL_VERSION } from '@shared/priority-score-model'
import type { UserCognitiveModel, UserModel } from '@shared/user-model'
import { buildPriorityScoreDimensions, type PriorityPlanningContext } from './priority-dimension-builder'
import { explainPriorityScore } from './priority-explanation-engine'
import { buildPriorityRecommendation } from './priority-recommendation-engine'
import { useSettingsStore } from '../store/settings.store'

export type ScoreObjectivePriorityV2Input = {
  objectiveModelV2: ObjectiveModelV2
  linkedTaskScores?: PriorityScoreV2[]
  userModel?: UserModel | null
  planningContext?: PriorityPlanningContext | null
  cognitiveModel?: UserCognitiveModel | null
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

function average(values: number[]): number {
  const finite = values.filter((value) => Number.isFinite(value))
  if (finite.length === 0) return 0
  return finite.reduce((sum, value) => sum + value, 0) / finite.length
}

function confidenceFrom(objective: ObjectiveModelV2, taskScores: PriorityScoreV2[] | undefined, oldScore?: number): number {
  return clampScore(
    average([
      objective.mission.declaredImportanceScore,
      objective.linkedTasks.length > 0 ? 75 : 45,
      taskScores && taskScores.length > 0 ? average(taskScores.map((score) => score.confidence)) : 45,
      oldScore !== undefined ? 70 : 45,
    ]),
  )
}

export function scoreObjectivePriorityV2(input: ScoreObjectivePriorityV2Input): PriorityScoreV2 {
  const now = input.now ?? new Date()
  const objective = input.objectiveModelV2
  const dimensions = buildPriorityScoreDimensions({
    targetType: 'objective',
    objectiveModelV2: objective,
    userModel: input.userModel,
    planningContext: input.planningContext,
    cognitiveModel: input.cognitiveModel,
    oldScore: input.oldScore,
    now,
  })
  const topTaskActionScore = Math.max(0, ...(input.linkedTaskScores ?? []).map((score) => score.actionPriorityScore))
  const topTaskPlanningScore = Math.max(0, ...(input.linkedTaskScores ?? []).map((score) => score.planningPriorityScore))

  let actionPriorityScore = weightedScore([
    [0.2, dimensions.importanceScore],
    [0.16, dimensions.objectiveImpactScore],
    [0.15, dimensions.urgencyScore],
    [0.14, dimensions.feasibilityScore],
    [0.12, topTaskActionScore],
    [0.1, dimensions.momentumScore],
    [0.08, dimensions.stagnationScore],
    [-0.08, dimensions.ambiguityPenalty],
  ])
  let planningPriorityScore = weightedScore([
    [0.22, dimensions.importanceScore],
    [0.16, dimensions.objectiveImpactScore],
    [0.15, topTaskPlanningScore],
    [0.14, dimensions.feasibilityScore],
    [0.12, dimensions.workloadPressureScore],
    [0.1, dimensions.stagnationScore],
    [0.08, dimensions.urgencyScore],
    [-0.08, dimensions.ambiguityPenalty],
    [-0.06, dimensions.overloadPenalty],
  ])
  let protectionPriorityScore = weightedScore([
    [0.28, dimensions.protectionNeedScore],
    [0.2, dimensions.importanceScore],
    [0.16, dimensions.avoidanceScore],
    [0.14, dimensions.objectiveImpactScore],
    [0.12, dimensions.stagnationScore],
    [0.1, dimensions.urgencyScore],
  ])
  let recoveryPriorityScore = weightedScore([
    [0.3, dimensions.stagnationScore],
    [0.25, dimensions.avoidanceScore],
    [0.18, dimensions.importanceScore],
    [0.12, dimensions.objectiveImpactScore],
    [0.1, dimensions.feasibilityScore],
    [-0.08, dimensions.ambiguityPenalty],
  ])

  if (objective.status.isCompleted) {
    actionPriorityScore = 0
    planningPriorityScore = 0
    protectionPriorityScore = 0
    recoveryPriorityScore = 0
  }

  const totalScore = objective.status.isCompleted
    ? 0
    : clampScore(Math.max(actionPriorityScore, planningPriorityScore, recoveryPriorityScore * 0.95))
  const confidence = confidenceFrom(objective, input.linkedTaskScores, input.oldScore)
  const hasNoNextAction = objective.nextAction.kind === 'create_task' || objective.nextAction.kind === 'review_objective'
  const recommendation = buildPriorityRecommendation({
    targetType: 'objective',
    dimensions,
    scores: {
      totalScore,
      actionPriorityScore,
      planningPriorityScore,
      protectionPriorityScore,
      recoveryPriorityScore,
    },
    suggestedDurationMinutes: objective.nextAction.recommendedSessionMinutes,
    isCompleted: objective.status.isCompleted,
    hasNoNextAction,
    nextStepKind: objective.nextAction.kind,
    confidence,
  })

  const scoreWithoutExplanation: PriorityScoreV2 = {
    targetType: 'objective',
    targetId: objective.identity.id,
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
      source: 'objective_model_v2',
      advisoryOnly: useSettingsStore.getState?.()?.engineV2Priority !== true,
      debug: {
        oldScore: input.oldScore,
        linkedTaskScoreCount: input.linkedTaskScores?.length ?? 0,
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
