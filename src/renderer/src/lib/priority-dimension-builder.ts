import type { CompletionGateResult } from '@shared/completion-gate'
import type { ObjectiveModelV2 } from '@shared/objective-model'
import type { PriorityScoreDimensions } from '@shared/priority-score-model'
import type { TaskModelV2 } from '@shared/task-model'
import type { UserCognitiveModel, UserModel, UserObjectivePreference } from '@shared/user-model'
import { calculateDeadlinePressure } from './deadline-feasibility-engine'

export type PriorityPlanningContext = {
  usableFreeMinutesBeforeDeadline?: number | null
  availableMinutes?: number | null
  plannedStart?: Date | string | null
  goodCognitiveWindow?: boolean
}

export type BuildPriorityScoreDimensionsInput = {
  targetType: 'task' | 'objective'
  taskModelV2?: TaskModelV2 | null
  objectiveModelV2?: ObjectiveModelV2 | null
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

function average(values: number[]): number {
  const finite = values.filter((value) => Number.isFinite(value))
  if (finite.length === 0) return 0
  return finite.reduce((sum, value) => sum + value, 0) / finite.length
}

function objectivePreference(userModel: UserModel | null | undefined, objectiveId: string | undefined): UserObjectivePreference | undefined {
  if (!objectiveId) return undefined
  return userModel?.objectivePreferences.find((preference) => preference.objectiveId === objectiveId)
}

function cognitiveFitScore(args: {
  cognitiveModel?: UserCognitiveModel | null
  planningContext?: PriorityPlanningContext | null
  now: Date
  highEnergyNeeded: boolean
}): number {
  if (args.planningContext?.goodCognitiveWindow) return args.highEnergyNeeded ? 88 : 75
  const hour =
    args.planningContext?.plannedStart instanceof Date
      ? args.planningContext.plannedStart.getHours()
      : typeof args.planningContext?.plannedStart === 'string'
        ? new Date(args.planningContext.plannedStart).getHours()
        : args.now.getHours()
  const performance = args.cognitiveModel?.hourlyPerformance.find((entry) => entry.hour === hour)
  const fatigue = args.cognitiveModel?.fatigueRiskByHour.find((entry) => entry.hour === hour)
  const inDeepWindow = Boolean(
    args.cognitiveModel?.bestDeepWorkWindows.some((window) => hour >= window.startHour && hour < window.endHour),
  )
  let score = performance?.sampleCount ? performance.averageEfficiency : 55
  if (inDeepWindow) score += args.highEnergyNeeded ? 20 : 10
  if (fatigue) score -= fatigue.risk * 0.35
  if (args.highEnergyNeeded && score < 45) score -= 10
  return clampScore(score)
}

function completionReliability(completion: CompletionGateResult | null | undefined): number {
  if (!completion) return 45
  if (completion.verifiedCompleted) return 100
  if (completion.decision === 'reject_completion') return 10
  if (completion.decision === 'accept_partial_progress') return 45
  if (completion.decision === 'accept_progress') return 65
  if (completion.decision === 'require_review') return 35
  return completion.finalConfidence
}

function uncertaintyPenalty(values: Array<number | undefined>): number {
  const confidence = average(values.filter((value): value is number => value !== undefined))
  if (confidence <= 0) return 55
  return clampScore(100 - confidence)
}

function taskDimensions(input: BuildPriorityScoreDimensionsInput): PriorityScoreDimensions {
  const task = input.taskModelV2
  const objective = input.objectiveModelV2
  if (!task) return emptyDimensions(70)
  const completion = input.completionGateResult ?? task.completionVerification
  const deadline = calculateDeadlinePressure({
    deadline: task.urgency.deadline,
    deadlineTime: task.urgency.deadlineTime,
    hasExactDeadlineTime: Boolean(task.urgency.deadlineTime),
    remainingMinutes: task.workload.remainingMinutes,
    usableFreeMinutesBeforeDeadline:
      input.planningContext?.usableFreeMinutesBeforeDeadline ?? task.urgency.usableFreeMinutesBeforeDeadline,
    now: input.now,
  })
  const objectivePreferenceScore = objectivePreference(input.userModel, task.identity.linkedObjectiveId ?? undefined)
  const importanceScore = clampScore(
    Math.max(
      task.purpose.importanceScore,
      objective?.mission.declaredImportanceScore ?? 0,
      objectivePreferenceScore?.declaredImportanceScore ?? 0,
    ),
  )
  const objectiveImpactScore = clampScore(
    task.identity.linkedObjectiveId
      ? Math.max(task.purpose.lifeImpactScore, objective?.mission.lifeImpactScore ?? 0, objectivePreferenceScore?.lifeImpactScore ?? 0)
      : Math.max(20, task.purpose.lifeImpactScore * 0.55),
  )
  const workloadPressureScore = clampScore(
    Math.max(
      task.workload.workloadScore,
      task.workload.complexityScore,
      task.workload.shouldBeSplit ? 82 : 0,
    ),
  )
  const progressNeedScore = clampScore(
    task.progress.progressPercent >= 85
      ? 72
      : Math.max(100 - task.progress.progressPercent, task.workload.remainingMinutes >= 180 ? 75 : 35),
  )
  const highEnergyNeeded = task.workload.workloadLevel === 'heavy' || task.workload.workloadLevel === 'extreme'
  const usefulContextKnown = task.appSiteContext.usefulApps.length + task.appSiteContext.usefulSites.length > 0
  const ambiguityPenalty = clampScore(task.risk.ambiguityRiskScore)
  const overloadPenalty = clampScore(
    Math.max(
      task.workload.shouldBeSplit ? 75 : 0,
      task.workload.remainingMinutes >= 600 ? 90 : task.workload.remainingMinutes / 8,
    ),
  )
  const feasibilityScore = clampScore(
    average([
      deadline.feasibilityScore,
      100 - ambiguityPenalty,
      100 - overloadPenalty * 0.45,
      usefulContextKnown ? 78 : 50,
      task.nextStep.kind === 'clarify_task' ? 25 : task.nextStep.kind === 'split_task' ? 45 : 75,
    ]),
  )
  const modelConfidence = average([
    task.completionVerification.finalConfidence,
    task.purpose.importanceScore,
    task.risk.overallRiskScore > 0 ? 70 : 45,
  ])

  return normalizeDimensions({
    importanceScore,
    objectiveImpactScore,
    urgencyScore: Math.max(task.urgency.urgencyScore, deadline.urgencyScore),
    deadlinePressureScore: Math.max(task.urgency.deadlineRiskRatio ? task.urgency.deadlineRiskRatio * 70 : 0, deadline.deadlinePressureScore),
    feasibilityScore,
    workloadPressureScore,
    progressNeedScore,
    stagnationScore: task.progress.stagnationScore,
    avoidanceScore: task.risk.avoidanceRiskScore,
    momentumScore: task.progress.momentumScore,
    cognitiveFitScore: cognitiveFitScore({
      cognitiveModel: input.cognitiveModel,
      planningContext: input.planningContext,
      now: input.now ?? new Date(),
      highEnergyNeeded,
    }),
    protectionNeedScore: task.protection.recommendedProtectionLevel,
    completionReliabilityScore: completionReliability(completion),
    ambiguityPenalty,
    overloadPenalty,
    uncertaintyPenalty: uncertaintyPenalty([modelConfidence, input.oldScore !== undefined ? 70 : undefined]),
  })
}

function objectiveDimensions(input: BuildPriorityScoreDimensionsInput): PriorityScoreDimensions {
  const objective = input.objectiveModelV2
  if (!objective) return emptyDimensions(70)
  const preference = objectivePreference(input.userModel, objective.identity.id)
  const hasClearAction = 'taskId' in objective.nextAction
  const importanceScore = clampScore(
    Math.max(
      objective.mission.declaredImportanceScore,
      preference?.declaredImportanceScore ?? 0,
      objective.mission.commitmentStrength === 'non_negotiable' ? 95 : 0,
      objective.mission.commitmentStrength === 'strong' ? 78 : 0,
    ),
  )
  const objectiveImpactScore = clampScore(Math.max(objective.mission.lifeImpactScore, preference?.lifeImpactScore ?? 0))
  const progressNeedScore = clampScore(
    objective.progress.progressPercent >= 80
      ? 35
      : Math.max(100 - objective.progress.progressPercent, objective.progress.remainingMinutes >= 360 ? 80 : 40),
  )
  const ambiguityPenalty = clampScore(hasClearAction ? 10 : 70)
  const overloadPenalty = clampScore(
    Math.max(
      objective.progress.remainingMinutes >= 900 ? 90 : objective.progress.remainingMinutes / 10,
      objective.progress.activeTaskCount >= 8 ? 80 : 0,
    ),
  )
  const feasibilityScore = clampScore(
    average([
      hasClearAction ? 75 : 30,
      100 - ambiguityPenalty,
      100 - overloadPenalty * 0.4,
      objective.nextAction.kind === 'create_task' ? 35 : 70,
    ]),
  )

  return normalizeDimensions({
    importanceScore,
    objectiveImpactScore,
    urgencyScore: objective.risk.deadlineRiskScore,
    deadlinePressureScore: objective.risk.deadlineRiskScore,
    feasibilityScore,
    workloadPressureScore: clampScore(Math.max(objective.progress.remainingMinutes / 9, objective.risk.overloadRiskScore)),
    progressNeedScore,
    stagnationScore: Math.max(objective.progress.stagnationScore, objective.risk.stagnationRiskScore, preference?.stagnationScore ?? 0),
    avoidanceScore: Math.max(objective.risk.avoidanceRiskScore, preference?.avoidanceScore ?? 0),
    momentumScore: Math.max(objective.progress.momentumScore, preference?.momentumScore ?? 0),
    cognitiveFitScore: cognitiveFitScore({
      cognitiveModel: input.cognitiveModel,
      planningContext: input.planningContext,
      now: input.now ?? new Date(),
      highEnergyNeeded: objective.protection.recommendedProtectionLevel >= 70,
    }),
    protectionNeedScore: objective.protection.recommendedProtectionLevel,
    completionReliabilityScore: objective.status.isCompleted ? 100 : 50,
    ambiguityPenalty,
    overloadPenalty,
    uncertaintyPenalty: uncertaintyPenalty([objective.mission.declaredImportanceScore, preference?.confidence, input.oldScore !== undefined ? 70 : undefined]),
  })
}

function normalizeDimensions(dimensions: PriorityScoreDimensions): PriorityScoreDimensions {
  return Object.fromEntries(
    Object.entries(dimensions).map(([key, value]) => [key, clampScore(value)]),
  ) as PriorityScoreDimensions
}

function emptyDimensions(uncertainty = 100): PriorityScoreDimensions {
  return {
    importanceScore: 0,
    objectiveImpactScore: 0,
    urgencyScore: 0,
    deadlinePressureScore: 0,
    feasibilityScore: 0,
    workloadPressureScore: 0,
    progressNeedScore: 0,
    stagnationScore: 0,
    avoidanceScore: 0,
    momentumScore: 0,
    cognitiveFitScore: 0,
    protectionNeedScore: 0,
    completionReliabilityScore: 0,
    ambiguityPenalty: 100,
    overloadPenalty: 0,
    uncertaintyPenalty: uncertainty,
  }
}

export function buildPriorityScoreDimensions(input: BuildPriorityScoreDimensionsInput): PriorityScoreDimensions {
  if (input.targetType === 'task') return taskDimensions(input)
  return objectiveDimensions(input)
}
