import { describe, it, expect } from 'vitest'
import { runExecutionPreviewDiagnostics } from './execution-preview-diagnostics'

describe('execution-preview-diagnostics', () => {
  const basePlan = {
    userId: 'u1',
    dateRange: { startDate: '2026-06-26T00:00:00Z', endDate: '2026-06-26T23:59:59Z' },
    readiness: { canApplyLater: false, readiness: 'ready_for_ui_preview' },
    safety: { status: 'safe' },
    days: [],
    dependencies: [],
    confidence: 100
  } as any

  it('detects invalid date range', () => {
    const diag = runExecutionPreviewDiagnostics({ ...basePlan, dateRange: { startDate: 'invalid', endDate: 'invalid' } })
    expect(diag.status).toBe('critical')
    expect(diag.issues.some(i => i.id === 'invalid_date_range')).toBe(true)
  })

  it('detects duplicate block ids', () => {
    const diag = runExecutionPreviewDiagnostics({
      ...basePlan,
      days: [
        {
          date: '2026-06-26',
          blocks: [
            { id: 'b1', date: '2026-06-26', durationMinutes: 30 },
            { id: 'b1', date: '2026-06-26', durationMinutes: 30 }
          ]
        }
      ]
    })
    expect(diag.status).toBe('warning')
    expect(diag.issues.some(i => i.id === 'duplicate_block_id')).toBe(true)
  })

  it('detects block duration <= 0', () => {
    const diag = runExecutionPreviewDiagnostics({
      ...basePlan,
      days: [
        {
          date: '2026-06-26',
          blocks: [
            { id: 'b1', date: '2026-06-26', durationMinutes: 0 }
          ]
        }
      ]
    })
    expect(diag.status).toBe('warning')
    expect(diag.issues.some(i => i.id === 'invalid_block_duration')).toBe(true)
  })

  it('detects safety critical but readiness not unsafe', () => {
    const diag = runExecutionPreviewDiagnostics({
      ...basePlan,
      safety: { status: 'critical' },
      readiness: { readiness: 'ready_for_ui_preview' }
    })
    expect(diag.status).toBe('critical')
    expect(diag.issues.some(i => i.id === 'safety_critical_but_ready')).toBe(true)
  })

  it('detects high confidence with missing dependencies', () => {
    const diag = runExecutionPreviewDiagnostics({
      ...basePlan,
      dependencies: [{ status: 'missing', required: true }],
      confidence: 100
    })
    expect(diag.status).toBe('warning')
    expect(diag.issues.some(i => i.id === 'confidence_too_high')).toBe(true)
  })
})
