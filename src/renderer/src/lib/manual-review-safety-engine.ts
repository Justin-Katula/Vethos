import { ManualReviewDraftV2 } from '../../../shared/manual-review-gate-model'

export interface ManualReviewSafetyCheckInput {
  draft?: ManualReviewDraftV2
  previewPlan?: any
  qaReport?: any
}

export interface ManualReviewSafetyCheckResult {
  status: 'safe' | 'warning' | 'blocked' | 'critical'
  blockers: string[]
  warnings: string[]
  canApplyAnything: false // MUST BE FALSE
  canProceedToActivationBridge: false // MUST BE FALSE
  confidence: number
}

export function runManualReviewSafetyCheck(input: ManualReviewSafetyCheckInput): ManualReviewSafetyCheckResult {
  const { draft, previewPlan, qaReport } = input

  let status: ManualReviewSafetyCheckResult['status'] = 'safe'
  const blockers: string[] = []
  const warnings: string[] = []

  // Check draft flags
  if (draft) {
    if (draft.canPersistReview || draft.canCreateSessions || draft.canStartSessions ||
        draft.canApplyPlanning || draft.canApplyBlocking || draft.canCompleteTasks ||
        draft.canProceedToActivationBridge) {
      status = 'critical'
      blockers.push('Draft contains truthy dangerous execution flags.')
    }

    if (draft.decisions.some(d => d.canApplyDecision)) {
      status = 'critical'
      blockers.push('Draft contains decisions with canApplyDecision set to true.')
    }
  }

  // Check QA mismatch
  if (qaReport && qaReport.qualityScore) {
    const qaStatus = qaReport.qualityScore.status
    if (qaStatus === 'unsafe' || qaStatus === 'critical') {
      if (draft?.status === 'approved_in_principle') {
        status = 'critical'
        blockers.push('Draft is approved but QA score is critical or unsafe.')
      } else if (status !== 'critical') {
        status = 'blocked'
        blockers.push('QA score is unsafe/critical.')
      }
    }
  }

  // Check NaN/Infinity in draft confidence
  if (draft && (!isFinite(draft.confidence) || isNaN(draft.confidence))) {
    status = 'critical'
    blockers.push('Draft confidence contains NaN or Infinity.')
  }

  // Check duplicate conflicting decisions
  if (draft && draft.blockDecisions.length > 0) {
    const seen = new Set<string>()
    for (const d of draft.blockDecisions) {
      if (seen.has(d.blockId)) {
        warnings.push(`Duplicate block decision found for ${d.blockId}.`)
        if (status === 'safe') status = 'warning'
      }
      seen.add(d.blockId)
    }
  }

  return {
    status,
    blockers,
    warnings,
    canApplyAnything: false,
    canProceedToActivationBridge: false,
    confidence: status === 'safe' ? 1 : 0
  }
}
