import { describe, it, expect } from 'vitest'
import { applyManualReviewDecisionToDraft } from './manual-review-decision-engine'
import { buildManualReviewDraft } from './manual-review-draft-builder'
import { ManualReviewDecisionV2 } from '../../../shared/manual-review-gate-model'

describe('applyManualReviewDecisionToDraft', () => {
  const baseDraft = buildManualReviewDraft({ previewPlan: { id: 'plan-1', days: [] } })

  it('does not mutate the original draft', () => {
    const draftCopy = JSON.parse(JSON.stringify(baseDraft))
    const decision: ManualReviewDecisionV2 = {
      id: 'd1', kind: 'approve_preview_in_principle', targetType: 'preview', decision: 'accepted_in_principle', createdAt: '', source: 'manual_review_ui', canApplyDecision: false
    }
    applyManualReviewDecisionToDraft({ draft: baseDraft, decision })
    
    expect(baseDraft).toEqual(draftCopy)
  })

  it('updates status to approved_in_principle', () => {
    const decision: ManualReviewDecisionV2 = {
      id: 'd1', kind: 'approve_preview_in_principle', targetType: 'preview', decision: 'accepted_in_principle', createdAt: '', source: 'manual_review_ui', canApplyDecision: false
    }
    const newDraft = applyManualReviewDecisionToDraft({ draft: baseDraft, decision })
    expect(newDraft.status).toBe('approved_in_principle')
  })

  it('clears local review', () => {
    const decision: ManualReviewDecisionV2 = {
      id: 'd1', kind: 'approve_preview_in_principle', targetType: 'preview', decision: 'accepted_in_principle', createdAt: '', source: 'manual_review_ui', canApplyDecision: false
    }
    let draft = applyManualReviewDecisionToDraft({ draft: baseDraft, decision })
    
    const clearDecision: ManualReviewDecisionV2 = {
      id: 'd2', kind: 'clear_local_review', targetType: 'preview', decision: 'cleared', createdAt: '', source: 'manual_review_ui', canApplyDecision: false
    }
    draft = applyManualReviewDecisionToDraft({ draft, decision: clearDecision })
    expect(draft.status).toBe('not_started')
    expect(draft.decisions.length).toBe(0)
  })

  it('rejects unknown block target', () => {
    const decision: ManualReviewDecisionV2 = {
      id: 'd1', kind: 'mark_block_accepted', targetType: 'block', targetId: 'ghost-block', decision: 'accepted_in_principle', createdAt: '', source: 'manual_review_ui', canApplyDecision: false
    }
    const newDraft = applyManualReviewDecisionToDraft({ 
      draft: baseDraft, 
      decision,
      previewPlan: { days: [{ blocks: [{ id: 'real-block' }] }] }
    })
    expect(newDraft.warnings.length).toBeGreaterThan(0)
    expect(newDraft.blockDecisions.length).toBe(0)
  })

  it('enforces all dangerous flags remain false', () => {
    const decision: ManualReviewDecisionV2 = {
      id: 'd1', kind: 'approve_preview_in_principle', targetType: 'preview', decision: 'accepted_in_principle', createdAt: '', source: 'manual_review_ui', canApplyDecision: false
    }
    const newDraft = applyManualReviewDecisionToDraft({ draft: baseDraft, decision })
    
    expect(newDraft.canApplyPlanning).toBe(false)
    expect(newDraft.canCreateSessions).toBe(false)
    expect(newDraft.canStartSessions).toBe(false)
    expect(newDraft.canProceedToActivationBridge).toBe(false)
  })
})
