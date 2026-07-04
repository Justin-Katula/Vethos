export const ExecutionPreviewUiFlags = {
  executionPreviewUiEnabled: true,
  executionPreviewDebugPanelEnabled: true,
  executionPreviewDiagnosticsPanelEnabled: true,
  executionPreviewActionsEnabled: true,

  // Dangerous controls MUST be strictly false
  executionPreviewUiControlsApply: false,
  executionPreviewUiControlsStartSession: false,
  executionPreviewUiControlsBlocking: false,
  executionPreviewUiControlsTaskCompletion: false,
  executionPreviewUiControlsPlanningStore: false,
  executionPreviewUiControlsAutoBuildPipeline: false
}
