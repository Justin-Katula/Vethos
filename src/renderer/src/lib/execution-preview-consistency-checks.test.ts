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
        canApplyPreview: true as unknown as false, // Runtime corruption injected intentionally.
        confidence: 100
      }
    })
    expect(report.status).toBe('critical')
    expect(report.checks.some(c => c.id === 'cc-3')).toBe(true)
  })

  it('détecte safety critical mais provider ready (cc-6)', () => {
    const report = runExecutionPreviewConsistencyChecks({
      providerState: { status: 'ready', errors: [], warnings: [], canGeneratePreview: false, canApplyPreview: false, confidence: 100 },
      previewPlan: {
        safety: { status: 'critical' },
        days: [],
      } as never,
    })
    expect(report.checks.some(c => c.id === 'cc-6')).toBe(true)
    expect(report.status).toBe('critical')
  })

  it('détecte canApplyLater true (cc-2)', () => {
    const report = runExecutionPreviewConsistencyChecks({
      previewPlan: {
        readiness: { canApplyLater: true as unknown as false },
        safety: { status: 'safe' },
        days: [],
      } as never,
    })
    expect(report.checks.some(c => c.id === 'cc-2')).toBe(true)
    expect(report.status).toBe('critical')
  })

  it('détecte les ids de bloc dupliqués (cc-4)', () => {
    const report = runExecutionPreviewConsistencyChecks({
      previewPlan: {
        safety: { status: 'safe' },
        days: [{
          date: '2026-01-01',
          status: 'ready_for_preview',
          blocks: [
            { id: 'dup', durationMinutes: 30 },
            { id: 'dup', durationMinutes: 30 },
          ],
          unplacedCount: 0,
          summary: { proposedWorkMinutes: 60, deepWorkMinutes: 0, rescueMinutes: 0, reviewMinutes: 0, blockedOrUnsafeCount: 0, warnings: [] },
          reasons: [], warnings: [], confidence: 100,
        }],
        summary: { totalProposedMinutes: 60 },
      } as never,
    })
    expect(report.checks.some(c => c.id === 'cc-4')).toBe(true)
  })

  it('détecte les blocs avec durée ≤ 0 (cc-5)', () => {
    const report = runExecutionPreviewConsistencyChecks({
      previewPlan: {
        safety: { status: 'safe' },
        days: [{
          date: '2026-01-01',
          status: 'ready_for_preview',
          blocks: [{ id: 'b1', durationMinutes: 0 }],
          unplacedCount: 0,
          summary: { proposedWorkMinutes: 0, deepWorkMinutes: 0, rescueMinutes: 0, reviewMinutes: 0, blockedOrUnsafeCount: 0, warnings: [] },
          reasons: [], warnings: [], confidence: 100,
        }],
        summary: { totalProposedMinutes: 0 },
      } as never,
    })
    expect(report.checks.some(c => c.id === 'cc-5')).toBe(true)
  })

  it('détecte les totaux incohérents — totalProposedMinutes < 0 (cc-7)', () => {
    const report = runExecutionPreviewConsistencyChecks({
      previewPlan: {
        safety: { status: 'safe' },
        days: [],
        summary: { totalProposedMinutes: -10 },
      } as never,
    })
    expect(report.checks.some(c => c.id === 'cc-7')).toBe(true)
  })
})
