import { describe, it, expect } from 'vitest'
import { runManualReviewGate } from './manual-review-gate-engine'
import { buildManualReviewDraft } from './manual-review-draft-builder'

describe('runManualReviewGate', () => {
  it('returns review_blocked if preview is missing', () => {
    const res = runManualReviewGate({})
    expect(res.status).toBe('review_blocked')
  })

  it('returns safety_blocked if safety engine is critical', () => {
    const badDraft = buildManualReviewDraft({ previewPlan: { id: 'p1', days: [] } })
    ;(badDraft as any).canApplyPlanning = true // inject poison

    const res = runManualReviewGate({ previewPlan: {}, draft: badDraft })
    expect(res.status).toBe('safety_blocked')
  })

  it('returns review_allowed for clean state', () => {
    const draft = buildManualReviewDraft({ previewPlan: { id: 'p1', days: [] } })
    const res = runManualReviewGate({ previewPlan: {}, draft })
    expect(res.status).toBe('review_allowed')
  })

  it('enforces canApplyAnything is false even when approved', () => {
    const draft = buildManualReviewDraft({ previewPlan: { id: 'p1', days: [] } })
    draft.status = 'approved_in_principle'

    const res = runManualReviewGate({ previewPlan: {}, draft })
    expect(res.status).toBe('review_allowed')
    expect(res.canApplyAnything).toBe(false)
    expect(res.canProceedToActivationBridge).toBe(false)
  })
})
