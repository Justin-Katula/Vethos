import { describe, it, expect } from 'vitest'
import { ExecutionPreviewUiFlags } from './execution-preview-ui-flags'

describe('execution-preview-ui-flags', () => {
  it('enables display and debug flags', () => {
    expect(ExecutionPreviewUiFlags.executionPreviewUiEnabled).toBe(true)
    expect(ExecutionPreviewUiFlags.executionPreviewDebugPanelEnabled).toBe(true)
    expect(ExecutionPreviewUiFlags.executionPreviewDiagnosticsPanelEnabled).toBe(true)
    expect(ExecutionPreviewUiFlags.executionPreviewActionsEnabled).toBe(true)
  })

  it('forces all control flags to strictly false', () => {
    expect(ExecutionPreviewUiFlags.executionPreviewUiControlsApply).toBe(false)
    expect(ExecutionPreviewUiFlags.executionPreviewUiControlsStartSession).toBe(false)
    expect(ExecutionPreviewUiFlags.executionPreviewUiControlsBlocking).toBe(false)
    expect(ExecutionPreviewUiFlags.executionPreviewUiControlsTaskCompletion).toBe(false)
    expect(ExecutionPreviewUiFlags.executionPreviewUiControlsPlanningStore).toBe(false)
    expect(ExecutionPreviewUiFlags.executionPreviewUiControlsAutoBuildPipeline).toBe(false)
  })
})
