import { describe, it, expect } from 'vitest'
import { buildManualReviewDraft } from './manual-review-draft-builder'
import { ManualReviewDraftV2 } from '../../../shared/manual-review-gate-model'

describe('buildManualReviewDraft', () => {
  it('creates an invalid draft when no preview plan is provided', () => {
    const draft = buildManualReviewDraft({})
    expect(draft.status).toBe('invalid')
    expect(draft.canApplyPlanning).toBe(false)
  })

  it('creates a draft with valid preview', () => {
    const draft = buildManualReviewDraft({
      previewPlan: { id: 'plan-1', days: [] }
    })
    expect(draft.status).toBe('not_started')
    expect(draft.previewPlanId).toBe('plan-1')
  })

  it('blocks draft when QA is unsafe', () => {
    const draft = buildManualReviewDraft({
      previewPlan: { id: 'plan-1', days: [] },
      qaReport: { qualityScore: { status: 'unsafe' } }
    })
    expect(draft.status).toBe('blocked_by_safety')
    expect(draft.blockers.length).toBeGreaterThan(0)
  })

  it('retains existing decisions if block is still present', () => {
    const existing: ManualReviewDraftV2 = buildManualReviewDraft({
      previewPlan: { id: 'plan-1', days: [{ blocks: [{ id: 'block-1' }] }] }
    })
    existing.blockDecisions.push({ blockId: 'block-1', decision: 'accepted_in_principle', createdAt: '' })

    const newDraft = buildManualReviewDraft({
      previewPlan: { id: 'plan-1', days: [{ blocks: [{ id: 'block-1' }] }] },
      existingLocalDraft: existing
    })
    expect(newDraft.blockDecisions.length).toBe(1)
  })

  it('removes invalid decisions if block is gone', () => {
    const existing: ManualReviewDraftV2 = buildManualReviewDraft({
      previewPlan: { id: 'plan-1', days: [{ blocks: [{ id: 'block-1' }] }] }
    })
    existing.blockDecisions.push({ blockId: 'old-block', decision: 'accepted_in_principle', createdAt: '' })

    const newDraft = buildManualReviewDraft({
      previewPlan: { id: 'plan-1', days: [{ blocks: [{ id: 'block-1' }] }] },
      existingLocalDraft: existing
    })
    expect(newDraft.blockDecisions.length).toBe(0) // old-block is missing from preview
  })

  it('does not mutate input parameters', () => {
    const existing: ManualReviewDraftV2 = buildManualReviewDraft({
      previewPlan: { id: 'plan-1', days: [{ blocks: [{ id: 'block-1' }] }] }
    })
    existing.blockDecisions.push({ blockId: 'block-1', decision: 'accepted_in_principle', createdAt: '' })
    
    const clone = JSON.parse(JSON.stringify(existing))

    buildManualReviewDraft({
      previewPlan: { id: 'plan-2', days: [] }, // Block 1 is gone
      existingLocalDraft: existing
    })

    // existing should remain unmodified
    expect(existing).toEqual(clone)
  })
})
