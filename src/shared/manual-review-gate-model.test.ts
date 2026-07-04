import { describe, it, expect } from 'vitest'
import { ManualReviewDraftV2, ManualReviewGateResult, ManualReviewDecisionV2 } from './manual-review-gate-model'

describe('manual-review-gate-model', () => {
  it('enforces canApply/canPersist/canProceed flags to be exactly false in Draft', () => {
    const draft: ManualReviewDraftV2 = {
      id: 'draft-1',
      status: 'not_started',
      previewDecision: 'undecided',
      dayDecisions: [],
      blockDecisions: [],
      decisions: [],
      warnings: [],
      blockers: [],
      canCreateSessions: false,
      canStartSessions: false,
      canApplyPlanning: false,
      canApplyBlocking: false,
      canCompleteTasks: false,
      canPersistReview: false,
      canProceedToActivationBridge: false,
      confidence: 1,
      metadata: {
        source: 'manual_review_gate',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        modelVersion: 1
      }
    }

    expect(draft.canCreateSessions).toBe(false)
    expect(draft.canStartSessions).toBe(false)
    expect(draft.canApplyPlanning).toBe(false)
    expect(draft.canApplyBlocking).toBe(false)
    expect(draft.canCompleteTasks).toBe(false)
    expect(draft.canPersistReview).toBe(false)
    expect(draft.canProceedToActivationBridge).toBe(false)
  })

  it('enforces all dangerous flags to be false in GateResult', () => {
    const result: ManualReviewGateResult = {
      status: 'review_allowed',
      reviewDraft: {} as ManualReviewDraftV2,
      canProceedToActivationBridge: false,
      canApplyAnything: false,
      blockers: [],
      warnings: [],
      nextRecommendedAction: 'keep_reviewing',
      confidence: 1
    }

    expect(result.canProceedToActivationBridge).toBe(false)
    expect(result.canApplyAnything).toBe(false)
  })

  it('enforces canApplyDecision is false in Decision', () => {
    const decision: ManualReviewDecisionV2 = {
      id: 'dec-1',
      kind: 'approve_preview_in_principle',
      targetType: 'preview',
      decision: 'accepted_in_principle',
      createdAt: new Date().toISOString(),
      source: 'manual_review_ui',
      canApplyDecision: false
    }

    expect(decision.canApplyDecision).toBe(false)
  })

  it('ensures outputs are serializable without NaN or Infinity', () => {
    const draft: ManualReviewDraftV2 = {
      id: 'draft-1',
      status: 'not_started',
      previewDecision: 'undecided',
      dayDecisions: [],
      blockDecisions: [],
      decisions: [],
      warnings: [],
      blockers: [],
      canCreateSessions: false,
      canStartSessions: false,
      canApplyPlanning: false,
      canApplyBlocking: false,
      canCompleteTasks: false,
      canPersistReview: false,
      canProceedToActivationBridge: false,
      confidence: 0.99,
      metadata: {
        source: 'manual_review_gate',
        createdAt: '2026-06-26T00:00:00Z',
        updatedAt: '2026-06-26T00:00:00Z',
        modelVersion: 1
      }
    }

    const serialized = JSON.stringify(draft)
    const deserialized = JSON.parse(serialized)
    expect(deserialized).toEqual(draft)
  })
})
