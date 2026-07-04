export type PriorityScoreV2Flags = {
  priorityScoreV2Enabled: true
  priorityDimensionsEnabled: true
  taskPriorityV2Enabled: true
  objectivePriorityV2Enabled: true
  deadlineFeasibilityEnabled: true
  priorityRankingEnabled: true
  priorityRecommendationsEnabled: true
  priorityExplanationsEnabled: true
  priorityOldScoreComparisonEnabled: true
  priorityControlsDisplay: false
  priorityControlsSorting: false
  priorityControlsPlanning: false
  priorityControlsSessionChoice: false
  priorityControlsBlocking: false
}

export const DEFAULT_PRIORITY_SCORE_V2_FLAGS: PriorityScoreV2Flags = {
  priorityScoreV2Enabled: true,
  priorityDimensionsEnabled: true,
  taskPriorityV2Enabled: true,
  objectivePriorityV2Enabled: true,
  deadlineFeasibilityEnabled: true,
  priorityRankingEnabled: true,
  priorityRecommendationsEnabled: true,
  priorityExplanationsEnabled: true,
  priorityOldScoreComparisonEnabled: true,
  priorityControlsDisplay: false,
  priorityControlsSorting: false,
  priorityControlsPlanning: false,
  priorityControlsSessionChoice: false,
  priorityControlsBlocking: false,
}
