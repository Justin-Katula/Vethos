import { describe, it, expect } from 'vitest'
import { runManualReviewDiagnostics } from './manual-review-diagnostics'
import { buildManualReviewDraft } from './manual-review-draft-builder'

describe('runManualReviewDiagnostics', () => {
  const baseDraft = buildManualReviewDraft({ previewPlan: { id: 'p1', days: [] } })

  it('detects missing draft', () => {
    const diag = runManualReviewDiagnostics({})
    expect(diag.status).toBe('critical')
    expect(diag.issues.some(i => i.id === 'no_draft')).toBe(true)
  })

  it('detects dangerous flags', () => {
    const badDraft = { ...baseDraft, canApplyPlanning: true as any }
    const diag = runManualReviewDiagnostics({ draft: badDraft, previewPlan: {} })
    expect(diag.status).toBe('critical')
    expect(diag.issues.some(i => i.id === 'dangerous_flags_true')).toBe(true)
  })

  it('detects dangerous decision flags', () => {
    const badDraft = { 
      ...baseDraft, 
      decisions: [{
        id: 'd1',
        kind: 'approve_preview_in_principle' as const,
        targetType: 'preview' as const,
        decision: 'accepted_in_principle' as const,
        createdAt: '',
        source: 'manual_review_ui' as const,
        canApplyDecision: true
      }] 
    }
    const diag = runManualReviewDiagnostics({ draft: badDraft, previewPlan: {} })
    expect(diag.status).toBe('critical')
    expect(diag.issues.some(i => i.id === 'dangerous_decision_true')).toBe(true)
  })

  it('detects duplicate decisions', () => {
    const draft = {
      ...baseDraft,
      blockDecisions: [
        { blockId: 'b1', decision: 'accepted_in_principle' as any, createdAt: '' },
        { blockId: 'b1', decision: 'rejected' as any, createdAt: '' }
      ]
    }
    const diag = runManualReviewDiagnostics({ draft, previewPlan: {} })
    expect(diag.issues.some(i => i.id === 'duplicate_block_decision')).toBe(true)
  })

  it('detects NaN', () => {
    const badDraft = { ...baseDraft, confidence: NaN }
    const diag = runManualReviewDiagnostics({ draft: badDraft, previewPlan: {} })
    expect(diag.status).toBe('critical')
  })
})
