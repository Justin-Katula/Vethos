import { describe, it, expect } from 'vitest'
import { explainManualReviewGate } from './manual-review-explanation'
import { buildManualReviewDraft } from './manual-review-draft-builder'

describe('explainManualReviewGate', () => {
  it('explains approved in principle', () => {
    const draft = buildManualReviewDraft({ previewPlan: { id: '1', days: [] } })
    draft.status = 'approved_in_principle'

    const explanation = explainManualReviewGate({ draft })
    expect(explanation.title).toBe('Plan approuvé en principe')
    expect(explanation.summary).toContain('acceptable')
    expect(explanation.keyPoints.some(p => p.includes('n\'applique pas'))).toBe(true)
  })

  it('explains rejected', () => {
    const draft = buildManualReviewDraft({ previewPlan: { id: '1', days: [] } })
    draft.status = 'rejected'

    const explanation = explainManualReviewGate({ draft })
    expect(explanation.title).toBe('Plan rejeté')
    expect(explanation.nextRecommendedAction).toBe('reject_preview')
  })

  it('explains critical error', () => {
    const explanation = explainManualReviewGate({ 
      diagnostics: { status: 'critical', issues: [], summary: [] }
    })
    expect(explanation.title).toBe('Erreur critique')
    expect(explanation.nextRecommendedAction).toBe('do_not_apply')
  })
})
