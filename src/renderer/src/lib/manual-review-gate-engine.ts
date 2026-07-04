import { ManualReviewDraftV2, ManualReviewGateResult } from '../../../shared/manual-review-gate-model'
import { runManualReviewSafetyCheck } from './manual-review-safety-engine'
import { buildManualReviewDraft } from './manual-review-draft-builder'

export interface RunManualReviewGateInput {
  draft?: ManualReviewDraftV2
  previewPlan?: any
  qaReport?: any
  settings?: any
}

export function runManualReviewGate(input: RunManualReviewGateInput): ManualReviewGateResult {
  const { previewPlan, qaReport } = input
  
  // ensure we have a draft
  const draft = input.draft || buildManualReviewDraft({ previewPlan, qaReport })

  const safety = runManualReviewSafetyCheck({ draft, previewPlan, qaReport })

  let status: ManualReviewGateResult['status'] = 'invalid'
  let nextAction: ManualReviewGateResult['nextRecommendedAction'] = 'do_not_apply'

  if (!previewPlan) {
    status = 'review_blocked'
    nextAction = 'fix_preview_first'
  } else if (safety.status === 'critical') {
    status = 'safety_blocked'
    nextAction = 'do_not_apply'
  } else if (qaReport?.qualityScore?.status === 'unsafe' || safety.status === 'blocked') {
    status = 'safety_blocked'
    nextAction = 'fix_qa_first'
  } else if (qaReport?.qualityScore?.status === 'warning' || safety.status === 'warning') {
    status = 'review_allowed_with_warnings'
    nextAction = 'keep_reviewing'
  } else {
    status = 'review_allowed'
    nextAction = draft.status === 'approved_in_principle' ? 'keep_reviewing' : 'request_changes'
  }

  // Double check approved but weak QA
  if (draft.status === 'approved_in_principle' && qaReport?.qualityScore?.status === 'warning') {
    status = 'review_allowed_with_warnings'
  }

  const isAdvisory = input.settings?.engineV2Execution !== true
  const canProceed = !isAdvisory && draft.status === 'approved_in_principle' && (status === 'review_allowed' || status === 'review_allowed_with_warnings')

  return {
    status,
    reviewDraft: draft,
    canProceedToActivationBridge: canProceed,
    canApplyAnything: canProceed,
    blockers: [...safety.blockers],
    warnings: [...safety.warnings],
    nextRecommendedAction: nextAction,
    confidence: safety.confidence
  }
}
