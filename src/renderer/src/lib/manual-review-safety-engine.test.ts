import { describe, it, expect } from 'vitest'
import { runManualReviewSafetyCheck } from './manual-review-safety-engine'
import { buildManualReviewDraft } from './manual-review-draft-builder'
import { applyManualReviewDecisionToDraft } from './manual-review-decision-engine'
import { ManualReviewDecisionV2 } from '../../../shared/manual-review-gate-model'

describe('runManualReviewSafetyCheck', () => {
  const baseDraft = buildManualReviewDraft({ previewPlan: { id: 'p1', days: [] } })

  it('detects truthy dangerous flags in draft', () => {
    const badDraft = { ...baseDraft, canApplyPlanning: true as any }
    const res = runManualReviewSafetyCheck({ draft: badDraft })
    expect(res.status).toBe('critical')
    expect(res.blockers[0]).toContain('dangerous execution flags')
  })

  it('detects canApplyDecision true', () => {
    const badDecision: ManualReviewDecisionV2 = {
      id: 'd1', kind: 'approve_preview_in_principle', targetType: 'preview', decision: 'accepted_in_principle', createdAt: '', source: 'manual_review_ui', canApplyDecision: true as any
    }
    const badDraft = { ...baseDraft, decisions: [badDecision] }
    const res = runManualReviewSafetyCheck({ draft: badDraft })
    expect(res.status).toBe('critical')
  })

  it('detects QA unsafe while approved', () => {
    const approvedDraft = applyManualReviewDecisionToDraft({
      draft: baseDraft,
      decision: { id: 'd1', kind: 'approve_preview_in_principle', targetType: 'preview', decision: 'accepted_in_principle', createdAt: '', source: 'manual_review_ui', canApplyDecision: false }
    })
    
    // forcefully bypassing the decision engine's safety check to test this engine independently
    approvedDraft.status = 'approved_in_principle' 

    const res = runManualReviewSafetyCheck({
      draft: approvedDraft,
      qaReport: { qualityScore: { status: 'unsafe' } }
    })

    expect(res.status).toBe('critical')
  })

  it('detects NaN', () => {
    const badDraft = { ...baseDraft, confidence: NaN }
    const res = runManualReviewSafetyCheck({ draft: badDraft })
    expect(res.status).toBe('critical')
  })

  it('returns false for activation booleans', () => {
    const res = runManualReviewSafetyCheck({ draft: baseDraft })
    expect(res.canApplyAnything).toBe(false)
    expect(res.canProceedToActivationBridge).toBe(false)
  })
})
