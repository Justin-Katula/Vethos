import { describe, it, expect } from 'vitest'
import { buildExecutionPreviewFromReadOnlyData } from './execution-preview-data-provider'

describe('execution-preview-data-provider', () => {
  it('builds a full state and enforces canApplyPreview is false', () => {
    const res = buildExecutionPreviewFromReadOnlyData({
      userId: 'user1',
      dateRange: { startDate: '2025-01-01', endDate: '2025-01-02' }
    })
    
    // Status can be partial or failed depending on the data, but the flags must be secure.
    expect(res.canApplyPreview).toBe(false)
    expect(res.canGeneratePreview).toBe(true)
    
    // We didn't pass tasks/schedules, so it will likely be partial or failed
    expect(res.status).not.toBe('idle')
  })

  it('handles missing userId correctly by returning unsafe status', () => {
    const res = buildExecutionPreviewFromReadOnlyData({
      dateRange: { startDate: '2025-01-01', endDate: '2025-01-02' }
    })
    expect(res.status).toBe('unsafe')
    expect(res.canApplyPreview).toBe(false)
  })
})
