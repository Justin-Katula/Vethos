export type PlacementPlanV2Flags = {
  placementPlanV2Enabled: true
  placementInputAdapterEnabled: true
  placementWindowSelectorEnabled: true
  taskFitEngineEnabled: true
  blockSizingEngineEnabled: true
  placementConstraintEngineEnabled: true
  normalPlacementStrategyEnabled: true
  deadlineCrisisPlacementStrategyEnabled: true
  recoveryPlacementStrategyEnabled: true
  placementConflictResolverEnabled: true
  placementExplanationsEnabled: true
  placementDiagnosticsEnabled: true

  placementControlsDisplay: boolean
  placementControlsPlanningStore: boolean
  placementControlsSessions: boolean
  placementControlsBlocking: boolean
  placementControlsAutoStart: boolean
}

export const DEFAULT_PLACEMENT_PLAN_V2_FLAGS: PlacementPlanV2Flags = {
  placementPlanV2Enabled: true,
  placementInputAdapterEnabled: true,
  placementWindowSelectorEnabled: true,
  taskFitEngineEnabled: true,
  blockSizingEngineEnabled: true,
  placementConstraintEngineEnabled: true,
  normalPlacementStrategyEnabled: true,
  deadlineCrisisPlacementStrategyEnabled: true,
  recoveryPlacementStrategyEnabled: true,
  placementConflictResolverEnabled: true,
  placementExplanationsEnabled: true,
  placementDiagnosticsEnabled: true,

  placementControlsDisplay: true,
  placementControlsPlanningStore: true,
  placementControlsSessions: true,
  placementControlsBlocking: true,
  placementControlsAutoStart: true,
}
