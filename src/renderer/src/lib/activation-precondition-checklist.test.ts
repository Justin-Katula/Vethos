import { describe, expect, it } from 'vitest'
import { buildActivationPreconditionChecklist } from './activation-precondition-checklist'
import { executionPreviewFixture, executionQaFixture, manualReviewFixture, manualReviewGateFixture } from './activation-test-fixtures'

describe('activation-precondition-checklist', () => {
  it('reports passed draft preconditions for healthy inputs', () => {
    const review = manualReviewFixture()
    const result = buildActivationPreconditionChecklist({
      previewPlan: executionPreviewFixture(), qaReport: executionQaFixture(),
      manualReviewDraft: review, manualReviewGateResult: manualReviewGateFixture(review),
    })
    expect(result.failedCount).toBe(0)
    expect(result.canActivateNow).toBe(false)
  })

  it('blocks when preview is missing', () => {
    const result = buildActivationPreconditionChecklist({ qaReport: executionQaFixture() })
    expect(result.status).toBe('blocked')
    expect(result.failedCount).toBeGreaterThan(0)
  })

  it('detects executable future actions', () => {
    const result = buildActivationPreconditionChecklist({
      previewPlan: executionPreviewFixture(), qaReport: executionQaFixture(),
      futureActions: [{
        id: 'a1', kind: 'future_start_session', targetType: 'session', label: 'Future session',
        status: 'requires_future_permission', reason: 'Test', canExecuteNow: true as unknown as false,
        requiredFutureFlags: [], requiredSafetyChecks: [], confidence: 100,
      }],
    })
    expect(result.status).toBe('blocked')
  })
})
