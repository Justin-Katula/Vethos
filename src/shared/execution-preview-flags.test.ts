import { describe, it, expect } from 'vitest'
import { ExecutionPreviewFlags } from './execution-preview-flags'

describe('execution-preview-flags', () => {
  it('enables all proposed-pipeline features', () => {
    expect(ExecutionPreviewFlags.executionPreviewV2Enabled).toBe(true)
    expect(ExecutionPreviewFlags.executionPreviewInputAdapterEnabled).toBe(true)
    expect(ExecutionPreviewFlags.executionPreviewDependencyResolverEnabled).toBe(true)
    expect(ExecutionPreviewFlags.executionPreviewPipelineTraceEnabled).toBe(true)
    expect(ExecutionPreviewFlags.executionPreviewReadinessGateEnabled).toBe(true)
    expect(ExecutionPreviewFlags.executionPreviewSafetyEngineEnabled).toBe(true)
    expect(ExecutionPreviewFlags.executionPreviewDayBuilderEnabled).toBe(true)
    expect(ExecutionPreviewFlags.executionPreviewPlanBuilderEnabled).toBe(true)
    expect(ExecutionPreviewFlags.executionPreviewUiDataAdapterEnabled).toBe(true)
    expect(ExecutionPreviewFlags.executionPreviewExplanationEnabled).toBe(true)
    expect(ExecutionPreviewFlags.executionPreviewDiagnosticsEnabled).toBe(true)
  })

  it('keeps all real action controls strictly false', () => {
    expect(ExecutionPreviewFlags.executionPreviewControlsDisplay).toBe(false)
    expect(ExecutionPreviewFlags.executionPreviewControlsApplyPlacement).toBe(false)
    expect(ExecutionPreviewFlags.executionPreviewControlsCreateSessions).toBe(false)
    expect(ExecutionPreviewFlags.executionPreviewControlsStartSessions).toBe(false)
    expect(ExecutionPreviewFlags.executionPreviewControlsBlocking).toBe(false)
    expect(ExecutionPreviewFlags.executionPreviewControlsTaskCompletion).toBe(false)
    expect(ExecutionPreviewFlags.executionPreviewControlsPlanningStore).toBe(false)
  })
})
