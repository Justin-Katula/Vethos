export const PRIORITY_SCORE_V2_MODEL_VERSION = 2

export type PriorityTargetType = 'task' | 'objective'

export type PriorityScoreDimensions = {
  importanceScore: number
  objectiveImpactScore: number
  urgencyScore: number
  deadlinePressureScore: number
  feasibilityScore: number
  workloadPressureScore: number
  progressNeedScore: number
  stagnationScore: number
  avoidanceScore: number
  momentumScore: number
  cognitiveFitScore: number
  protectionNeedScore: number
  completionReliabilityScore: number
  ambiguityPenalty: number
  overloadPenalty: number
  uncertaintyPenalty: number
}

export type PriorityRecommendedAction =
  | 'do_now'
  | 'schedule_today'
  | 'schedule_soon'
  | 'protect_strongly'
  | 'recover'
  | 'create_task'
  | 'split_first'
  | 'clarify_first'
  | 'wait'
  | 'ignore_for_now'
  | 'manual_review'

export type PriorityUrgencyLabel = 'none' | 'low' | 'medium' | 'high' | 'critical'
export type PriorityRiskLabel = 'safe' | 'watch' | 'at_risk' | 'critical'

export type PriorityRecommendation = {
  recommendedAction: PriorityRecommendedAction
  suggestedDurationMinutes?: number
  reason: string
  urgencyLabel: PriorityUrgencyLabel
  riskLabel: PriorityRiskLabel
  confidence: number
}

export type PriorityExplanation = {
  title: string
  summary: string
  reasons: string[]
  warnings: string[]
  debug?: Record<string, unknown>
}

export type PriorityScoreMetadata = {
  modelVersion: number
  createdAt: string
  updatedAt: string
  source: 'shadow_priority_engine' | 'task_model_v2' | 'objective_model_v2' | 'user_model' | 'fallback'
  shadowOnly: boolean
  debug?: Record<string, unknown>
}

export type PriorityScoreV2 = {
  targetType: PriorityTargetType
  targetId: string
  totalScore: number
  actionPriorityScore: number
  planningPriorityScore: number
  protectionPriorityScore: number
  recoveryPriorityScore: number
  dimensions: PriorityScoreDimensions
  recommendation: PriorityRecommendation
  explanation: PriorityExplanation
  confidence: number
  metadata: PriorityScoreMetadata
}

export type DeadlineFeasibilityStatus =
  | 'no_deadline'
  | 'safe'
  | 'watch'
  | 'tight'
  | 'critical'
  | 'impossible'
  | 'overdue'

export type DeadlineFeasibilityResult = {
  deadlinePassed: boolean
  minutesUntilDeadline?: number
  usableFreeMinutesBeforeDeadline?: number
  deadlineRiskRatio?: number
  urgencyScore: number
  deadlinePressureScore: number
  feasibilityScore: number
  status: DeadlineFeasibilityStatus
  reasons: string[]
  debug?: Record<string, unknown>
}

export type PriorityScoreComparison = {
  targetType?: PriorityTargetType
  targetId?: string
  oldScore?: number
  newTotalScore: number
  differenceLabel: 'same_direction' | 'v2_higher' | 'v2_lower' | 'conflict' | 'old_missing' | 'new_missing'
  explanation: string[]
  shouldInspect: boolean
}

export type PriorityRankingMode = 'action' | 'planning' | 'protection' | 'recovery'

export type PriorityRankedItem = {
  rank: number
  score: PriorityScoreV2
  modeScore: number
  tieBreakScore: number
  reasons: string[]
}

export type PriorityRankingResult = {
  mode: PriorityRankingMode
  rankedItems: PriorityRankedItem[]
  topItem?: PriorityRankedItem
  ties: Array<{ itemIds: string[]; score: number }>
  warnings: string[]
  explanation: string[]
}

export type DiagnosticIssue = {
  id: string
  severity: 'warning' | 'critical'
  targetType?: PriorityTargetType
  targetId?: string
  message: string
  debug?: Record<string, unknown>
}

export type PriorityScoreDiagnostics = {
  status: 'healthy' | 'warning' | 'critical'
  issues: DiagnosticIssue[]
  summary: string[]
}

export type PriorityScoreSnapshot = {
  taskScores: PriorityScoreV2[]
  objectiveScores: PriorityScoreV2[]
  rankings: {
    action: PriorityRankingResult
    planning: PriorityRankingResult
    protection: PriorityRankingResult
    recovery: PriorityRankingResult
  }
  comparisons: PriorityScoreComparison[]
  diagnostics: PriorityScoreDiagnostics
  metadata: {
    shadowOnly: boolean
    createdAt: string
    modelVersion: number
    debug?: Record<string, unknown>
  }
}

export type PriorityUiData = {
  targetType: PriorityTargetType
  targetId: string
  priorityLabel: 'none' | 'low' | 'medium' | 'high' | 'critical'
  mainReason: string
  urgencyLabel: PriorityUrgencyLabel
  riskLabel: PriorityRiskLabel
  feasibilityLabel: 'easy' | 'possible' | 'tight' | 'hard' | 'impossible'
  nextAction: PriorityRecommendedAction
  protectionLabel: 'none' | 'light' | 'normal' | 'strong' | 'strict'
  confidenceLabel: 'low' | 'medium' | 'high'
  why: string[]
  warnings: string[]
}
