export type PlanningContextV2Flags = {
  planningContextV2Enabled: true
  scheduleNormalizerEnabled: true
  dayTimelineEnabled: true
  rawFreeTimeEnabled: true
  usableFreeTimeEnabled: true
  preparationTransitionEnabled: true
  recoveryProtectionEnabled: true
  dailyCapacityEnabled: true
  deadlineAvailabilityEnabled: true
  deadlineCrisisContextEnabled: true
  freeTimeExplanationsEnabled: true
  planningContextDiagnosticsEnabled: true
  planningContextControlsDisplay: false
  planningContextControlsPlanning: false
  planningContextControlsSessions: false
  planningContextControlsBlocking: false
}

export const DEFAULT_PLANNING_CONTEXT_V2_FLAGS: PlanningContextV2Flags = {
  planningContextV2Enabled: true,
  scheduleNormalizerEnabled: true,
  dayTimelineEnabled: true,
  rawFreeTimeEnabled: true,
  usableFreeTimeEnabled: true,
  preparationTransitionEnabled: true,
  recoveryProtectionEnabled: true,
  dailyCapacityEnabled: true,
  deadlineAvailabilityEnabled: true,
  deadlineCrisisContextEnabled: true,
  freeTimeExplanationsEnabled: true,
  planningContextDiagnosticsEnabled: true,
  planningContextControlsDisplay: false,
  planningContextControlsPlanning: false,
  planningContextControlsSessions: false,
  planningContextControlsBlocking: false,
}
