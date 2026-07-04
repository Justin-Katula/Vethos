import { describe, it, expect } from 'vitest'
import { runExecutionPreviewConsistencyChecks } from './execution-preview-consistency-checks'

describe('execution-preview-consistency-checks', () => {
  it('fails if provider is ready but no plan exists', () => {
    const report = runExecutionPreviewConsistencyChecks({
      providerState: {
        status: 'ready',
        errors: [],
        warnings: [],
        canGeneratePreview: false,
        canApplyPreview: false,
        confidence: 100
      }
    })
    expect(report.status).toBe('critical')
    expect(report.checks.some(c => c.id === 'cc-1')).toBe(true)
  })

  it('fails if canApplyPreview is true', () => {
    const report = runExecutionPreviewConsistencyChecks({
      providerState: {
        status: 'idle',
        errors: [],
        warnings: [],
        canGeneratePreview: false,
        canApplyPreview: true as boolean, // Forced cast to test check
        confidence: 100
      }
    })
    expect(report.status).toBe('critical')
    expect(report.checks.some(c => c.id === 'cc-3')).toBe(true)
  })
})
