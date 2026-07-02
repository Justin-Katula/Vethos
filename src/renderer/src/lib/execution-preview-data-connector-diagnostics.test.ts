import { describe, it, expect } from 'vitest'
import { runExecutionPreviewDataConnectorDiagnostics } from './execution-preview-data-connector-diagnostics'

describe('execution-preview-data-connector-diagnostics', () => {
  it('detects missing userId', () => {
    const diag = runExecutionPreviewDataConnectorDiagnostics({
      rawSnapshot: { userId: undefined } as any
    })
    expect(diag.issues.some(i => i.id === 'missing_user_id')).toBe(true)
    expect(diag.status).toBe('warning') // Minimum
  })

  it('detects canApplyPreview = true as a critical security violation', () => {
    const diag = runExecutionPreviewDataConnectorDiagnostics({
      providerState: { canApplyPreview: true, errors: [], status: 'ready', warnings: [] } as any
    })
    expect(diag.issues.some(i => i.id === 'can_apply_preview_true')).toBe(true)
    expect(diag.status).toBe('critical')
  })

  it('detects canApplyLater = true as a critical security violation', () => {
    const diag = runExecutionPreviewDataConnectorDiagnostics({
      providerState: { previewPlan: { readiness: { canApplyLater: true } }, errors: [], status: 'ready', warnings: [] } as any
    })
    expect(diag.issues.some(i => i.id === 'can_apply_later_true')).toBe(true)
    expect(diag.status).toBe('critical')
  })

  it('detects NaN in snapshot', () => {
    const diag = runExecutionPreviewDataConnectorDiagnostics({
      sanitizedSnapshot: { tasks: [{ remainingMinutes: NaN }], objectives: [], schedules: [], sessions: [], apps: [], sites: [], warnings: [], confidence: 100, dateRange: { startDate: '', endDate: '' }, metadata: {} as any, userId: 'user' }
    })
    expect(diag.issues.some(i => i.id === 'invalid_number_format')).toBe(true)
    expect(diag.status).toBe('critical')
  })
})
