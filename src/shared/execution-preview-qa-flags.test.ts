import { describe, it, expect } from 'vitest'
import { executionPreviewQaFlags } from './execution-preview-qa-flags'

describe('execution-preview-qa-flags', () => {
  it('enables analysis but disables write/apply controls', () => {
    expect(executionPreviewQaFlags.executionPreviewQaEnabled).toBe(true)
    expect(executionPreviewQaFlags.executionPreviewQaControlsApplyFixes).toBe(false)
    expect(executionPreviewQaFlags.executionPreviewQaControlsWriteStores).toBe(false)
    expect(executionPreviewQaFlags.executionPreviewQaControlsStartSessions).toBe(false)
    expect(executionPreviewQaFlags.executionPreviewQaControlsBlocking).toBe(false)
  })
})
