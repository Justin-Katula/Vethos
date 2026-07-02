export type PlanningContextV2Flags = {
  planningContextV2ShadowEnabled: true
  scheduleNormalizerShadowEnabled: true
  dayTimelineShadowEnabled: true
  rawFreeTimeShadowEnabled: true
  usableFreeTimeShadowEnabled: true
  preparationTransitionShadowEnabled: true
  recoveryProtectionShadowEnabled: true
  dailyCapacityShadowEnabled: true
  deadlineAvailabilityShadowEnabled: true
  deadlineCrisisContextShadowEnabled: true
  freeTimeExplanationsEnabled: true
  planningContextDiagnosticsEnabled: true
  planningContextControlsDisplay: false
  planningContextControlsPlanning: false
  planningContextControlsSessions: false
  planningContextControlsBlocking: false
}

export const DEFAULT_PLANNING_CONTEXT_V2_FLAGS: PlanningContextV2Flags = {
  planningContextV2ShadowEnabled: true,
  scheduleNormalizerShadowEnabled: true,
  dayTimelineShadowEnabled: true,
  rawFreeTimeShadowEnabled: true,
  usableFreeTimeShadowEnabled: true,
  preparationTransitionShadowEnabled: true,
  recoveryProtectionShadowEnabled: true,
  dailyCapacityShadowEnabled: true,
  deadlineAvailabilityShadowEnabled: true,
  deadlineCrisisContextShadowEnabled: true,
  freeTimeExplanationsEnabled: true,
  planningContextDiagnosticsEnabled: true,
  planningContextControlsDisplay: false,
  planningContextControlsPlanning: false,
  planningContextControlsSessions: false,
  planningContextControlsBlocking: false,
}
