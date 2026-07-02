import { describe, expect, it } from 'vitest'
import { runActivationBridgeGate } from './activation-bridge-gate-engine'
import { buildExecutionContractDraft } from './activation-contract-draft-builder'
import { executionPreviewFixture, executionQaFixture, manualReviewFixture, manualReviewGateFixture } from './activation-test-fixtures'

function contractFixture() {
  const review = manualReviewFixture()
  return buildExecutionContractDraft({
    previewPlan: executionPreviewFixture(), qaReport: executionQaFixture(),
    manualReviewDraft: review, manualReviewGateResult: manualReviewGateFixture(review),
  })
}

describe('activation-bridge-gate-engine', () => {
  it('is invalid without a contract draft', () => {
    expect(runActivationBridgeGate({}).status).toBe('blocked_by_missing_contract')
  })

  it('is blocked by review when not approved', () => {
    const review = { ...manualReviewFixture(), status: 'in_review' as const, previewDecision: 'undecided' as const }
    const contract = buildExecutionContractDraft({
      previewPlan: executionPreviewFixture(),
      qaReport: executionQaFixture(),
      manualReviewDraft: review,
      manualReviewGateResult: manualReviewGateFixture(review)
    })
    const result = runActivationBridgeGate({ contractDraft: contract, manualReviewDraft: review })
    expect(result.status).toBe('blocked_by_review')
  })

  it('is blocked by invalid QA', () => {
    const qa = { ...executionQaFixture(), status: 'invalid' as const }
    const result = runActivationBridgeGate({
      contractDraft: { ...contractFixture(), status: 'blocked' },
      manualReviewDraft: manualReviewFixture(), qaReport: qa,
    })
    expect(result.status).toBe('blocked_by_qa')
  })

  it('returns a non-executable ready draft for healthy inputs', () => {
    const result = runActivationBridgeGate({
      contractDraft: contractFixture(), previewPlan: executionPreviewFixture(),
      qaReport: executionQaFixture(), manualReviewDraft: manualReviewFixture(),
    })
    expect(result.status).toBe('draft_ready')
    expect(result.canProceedToRealActivation).toBe(false)
    expect(result.canApplyAnythingNow).toBe(false)
  })
})
