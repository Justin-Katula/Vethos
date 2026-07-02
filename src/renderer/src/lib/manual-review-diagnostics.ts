import { ManualReviewDraftV2, ManualReviewGateResult, ManualReviewDiagnostics } from '../../../shared/manual-review-gate-model'

export interface ManualReviewDiagnosticsInput {
  draft?: ManualReviewDraftV2
  gateResult?: ManualReviewGateResult
  previewPlan?: any
  qaReport?: any
}

export function runManualReviewDiagnostics(input: ManualReviewDiagnosticsInput): ManualReviewDiagnostics {
  const { draft, gateResult, previewPlan, qaReport } = input

  const issues: ManualReviewDiagnostics['issues'] = []
  let status: ManualReviewDiagnostics['status'] = 'healthy'
  const summary: string[] = []

  if (!draft) {
    issues.push({ id: 'no_draft', severity: 'critical', message: 'Manual review draft is missing.' })
    status = 'critical'
  }
  if (!previewPlan) {
    issues.push({ id: 'no_preview', severity: 'critical', message: 'Execution preview plan is missing.' })
    status = 'critical'
  }
  if (!qaReport) {
    issues.push({ id: 'no_qa', severity: 'medium', message: 'QA report is missing.', suggestion: 'Ensure QA ran before Manual Review.' })
    if (status !== 'critical') status = 'warning'
  }

  if (draft) {
    // Check dangerous flags
    const dangerousFlags = [
      draft.canApplyPlanning, draft.canStartSessions, draft.canPersistReview,
      draft.canApplyBlocking, draft.canCompleteTasks, draft.canProceedToActivationBridge
    ]
    if (dangerousFlags.some(f => f === true)) {
      issues.push({ id: 'dangerous_flags_true', severity: 'critical', message: 'One or more dangerous execution flags are true in the draft.' })
      status = 'critical'
    }

    if (draft.decisions.some(d => d.canApplyDecision)) {
      issues.push({ id: 'dangerous_decision_true', severity: 'critical', message: 'A decision has canApplyDecision set to true.' })
      status = 'critical'
    }

    // Weak QA but approved
    if (draft.status === 'approved_in_principle' && qaReport?.qualityScore?.status === 'warning') {
      issues.push({ id: 'approved_weak_qa', severity: 'medium', message: 'Preview approved but QA score has warnings.', suggestion: 'Review warnings before concluding.' })
      if (status !== 'critical') status = 'warning'
    }

    // Approved but no decisions recorded
    if (draft.status === 'approved_in_principle' && draft.decisions.length === 0) {
      issues.push({ id: 'approved_no_decisions', severity: 'low', message: 'Draft is approved in principle but history is empty.' })
    }

    // Duplicate decisions for blocks
    const seenBlocks = new Set<string>()
    for (const d of draft.blockDecisions) {
      if (seenBlocks.has(d.blockId)) {
        issues.push({ id: 'duplicate_block_decision', severity: 'medium', message: `Multiple decisions found for block ${d.blockId}.` })
        if (status !== 'critical') status = 'warning'
      }
      seenBlocks.add(d.blockId)
    }

    // Absent targets
    if (previewPlan && previewPlan.days) {
      const validIds = new Set<string>()
      previewPlan.days.forEach((day: any) => {
        if (day.blocks) {
          day.blocks.forEach((b: any) => validIds.add(b.id))
        }
      })
      for (const d of draft.blockDecisions) {
        if (!validIds.has(d.blockId)) {
          issues.push({ id: 'absent_block_id', severity: 'low', message: `Decision references missing block ID: ${d.blockId}` })
        }
      }
    }

    // NaN / Infinity
    if (!isFinite(draft.confidence) || isNaN(draft.confidence)) {
      issues.push({ id: 'nan_confidence', severity: 'critical', message: 'Confidence score is NaN or Infinity.' })
      status = 'critical'
    }
  }

  if (gateResult && (gateResult.canApplyAnything || gateResult.canProceedToActivationBridge)) {
    issues.push({ id: 'gate_activation_enabled', severity: 'critical', message: 'GateResult explicitly allows activation.' })
    status = 'critical'
  }

  summary.push(`Status is ${status} with ${issues.length} issues.`)
  if (status === 'critical') summary.push('Manual Review cannot proceed safely.')

  return {
    status,
    issues,
    summary
  }
}
