import { describe, expect, it } from 'vitest'
import { buildExecutionContractDraft } from './activation-contract-draft-builder'
import { executionPreviewFixture, executionQaFixture, manualReviewFixture, manualReviewGateFixture } from './activation-test-fixtures'

describe('activation-contract-draft-builder', () => {
  it('fails if preview is missing', () => {
    const draft = buildExecutionContractDraft({})
    expect(draft.status).toBe('invalid')
  })

  it('fails if review is missing', () => {
    const draft = buildExecutionContractDraft({ previewPlan: executionPreviewFixture(), qaReport: executionQaFixture() })
    expect(draft.status).toBe('blocked')
  })

  it('fails if review is not approved', () => {
    const review = { ...manualReviewFixture(), status: 'in_review' as const, previewDecision: 'undecided' as const }
    const draft = buildExecutionContractDraft({
      previewPlan: executionPreviewFixture(), qaReport: executionQaFixture(),
      manualReviewDraft: review, manualReviewGateResult: manualReviewGateFixture(review),
    })
    expect(draft.status).toBe('blocked')
  })

  it('fails if QA is unsafe', () => {
    const qa = { ...executionQaFixture(), status: 'unsafe' as const }
    const review = manualReviewFixture()
    const draft = buildExecutionContractDraft({
      previewPlan: executionPreviewFixture(), qaReport: qa,
      manualReviewDraft: review, manualReviewGateResult: manualReviewGateFixture(review),
    })
    expect(draft.status).toBe('unsafe')
  })

  it('fails if preview safety is critical', () => {
    const plan = executionPreviewFixture()
    plan.safety = { ...plan.safety, status: 'critical' }
    const review = manualReviewFixture()
    const draft = buildExecutionContractDraft({
      previewPlan: plan, qaReport: executionQaFixture(),
      manualReviewDraft: review, manualReviewGateResult: manualReviewGateFixture(review),
    })
    expect(draft.status).toBe('unsafe')
  })

  it('returns a non-executable draft when inputs are approved', () => {
    const plan = executionPreviewFixture()
    const review = manualReviewFixture()
    const draft = buildExecutionContractDraft({
      previewPlan: plan, qaReport: executionQaFixture(),
      manualReviewDraft: review, manualReviewGateResult: manualReviewGateFixture(review),
    })
    expect(draft.status).toBe('draft_only')
    expect(draft.futureActions.length).toBeGreaterThan(0)
    expect(draft.futureActions.every((action) => !action.canExecuteNow)).toBe(true)
    expect(plan.readiness.canApplyLater).toBe(false)
    expect([
      draft.canApplyPlanningNow, draft.canCreateSessionsNow, draft.canStartSessionsNow,
      draft.canEnableBlockingNow, draft.canCompleteTasksNow, draft.canPersistContractNow,
      draft.canActivateNow,
    ]).toEqual([false, false, false, false, false, false, false])
  })
})
