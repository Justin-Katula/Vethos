export const ExecutionPreviewFlags = {
  executionPreviewV2Enabled: true,
  executionPreviewInputAdapterEnabled: true,
  executionPreviewDependencyResolverEnabled: true,
  executionPreviewPipelineTraceEnabled: true,
  executionPreviewReadinessGateEnabled: true,
  executionPreviewSafetyEngineEnabled: true,
  executionPreviewDayBuilderEnabled: true,
  executionPreviewPlanBuilderEnabled: true,
  executionPreviewUiDataAdapterEnabled: true,
  executionPreviewExplanationEnabled: true,
  executionPreviewDiagnosticsEnabled: true,

  // Dangerous / Action flags MUST remain false
  executionPreviewControlsDisplay: false,
  executionPreviewControlsApplyPlacement: false,
  executionPreviewControlsCreateSessions: false,
  executionPreviewControlsStartSessions: false,
  executionPreviewControlsBlocking: false,
  executionPreviewControlsTaskCompletion: false,
  executionPreviewControlsPlanningStore: false,
}
