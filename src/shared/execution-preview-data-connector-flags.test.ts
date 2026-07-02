import { describe, it, expect } from 'vitest'
import { ExecutionPreviewDataConnectorFlags } from './execution-preview-data-connector-flags'

describe('ExecutionPreviewDataConnectorFlags', () => {
  it('ensures read-only flags are true and write/apply flags are strictly false', () => {
    expect(ExecutionPreviewDataConnectorFlags.executionPreviewDataConnectorEnabled).toBe(true)
    expect(ExecutionPreviewDataConnectorFlags.executionPreviewReadOnlySnapshotEnabled).toBe(true)
    expect(ExecutionPreviewDataConnectorFlags.executionPreviewManualGenerateEnabled).toBe(true)

    expect(ExecutionPreviewDataConnectorFlags.executionPreviewAutoGenerateEnabled).toBe(false)
    expect(ExecutionPreviewDataConnectorFlags.executionPreviewBackgroundRefreshEnabled).toBe(false)
    expect(ExecutionPreviewDataConnectorFlags.executionPreviewDataConnectorWritesStores).toBe(false)
    expect(ExecutionPreviewDataConnectorFlags.executionPreviewDataConnectorWritesLocalStorage).toBe(false)
    expect(ExecutionPreviewDataConnectorFlags.executionPreviewDataConnectorCreatesSessions).toBe(false)
    expect(ExecutionPreviewDataConnectorFlags.executionPreviewDataConnectorStartsSessions).toBe(false)
    expect(ExecutionPreviewDataConnectorFlags.executionPreviewDataConnectorAppliesPlanning).toBe(false)
    expect(ExecutionPreviewDataConnectorFlags.executionPreviewDataConnectorAppliesBlocking).toBe(false)
    expect(ExecutionPreviewDataConnectorFlags.executionPreviewDataConnectorAppliesTaskCompletion).toBe(false)
  })
})
