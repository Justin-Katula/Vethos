export type PriorityScoreV2Flags = {
  priorityScoreV2ShadowEnabled: true
  priorityDimensionsShadowEnabled: true
  taskPriorityV2ShadowEnabled: true
  objectivePriorityV2ShadowEnabled: true
  deadlineFeasibilityShadowEnabled: true
  priorityRankingShadowEnabled: true
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
  priorityScoreV2ShadowEnabled: true,
  priorityDimensionsShadowEnabled: true,
  taskPriorityV2ShadowEnabled: true,
  objectivePriorityV2ShadowEnabled: true,
  deadlineFeasibilityShadowEnabled: true,
  priorityRankingShadowEnabled: true,
  priorityRecommendationsEnabled: true,
  priorityExplanationsEnabled: true,
  priorityOldScoreComparisonEnabled: true,
  priorityControlsDisplay: false,
  priorityControlsSorting: false,
  priorityControlsPlanning: false,
  priorityControlsSessionChoice: false,
  priorityControlsBlocking: false,
}
