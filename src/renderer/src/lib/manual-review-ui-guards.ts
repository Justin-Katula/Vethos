import { ManualReviewViewModel } from './manual-review-view-model'

export interface ManualReviewUiGuardsResult {
  safe: boolean
  issues: Array<{
    id: string
    severity: 'low' | 'medium' | 'high' | 'critical'
    message: string
  }>
}

export function guardManualReviewUi(viewModel: ManualReviewViewModel): ManualReviewUiGuardsResult {
  const issues: ManualReviewUiGuardsResult['issues'] = []
  let safe = true

  if (viewModel.canApplyAnything) {
    issues.push({ id: 'guard_can_apply', severity: 'critical', message: 'ViewModel canApplyAnything is true.' })
    safe = false
  }

  if (viewModel.canProceedToActivationBridge) {
    issues.push({ id: 'guard_can_proceed', severity: 'critical', message: 'ViewModel canProceedToActivationBridge is true.' })
    safe = false
  }

  const forbiddenWords = [/apply/i, /appliqu/i, /start/i, /block/i, /autofix/i, /auto-fix/i, /activer/i, /exécuter/i, /executer/i]
  const validActionTypes = new Set([
    'approve_preview_in_principle', 'reject_preview', 'request_changes',
    'mark_day_needs_review', 'mark_block_accepted', 'mark_block_needs_review',
    'mark_block_rejected', 'request_clarification', 'clear_local_review'
  ])

  for (const action of viewModel.actions) {
    if (action.dangerous) {
      issues.push({ id: 'guard_dangerous_action', severity: 'critical', message: `Action ${action.label} is marked as dangerous.` })
      safe = false
    }

    if (!validActionTypes.has(action.actionType)) {
      issues.push({ id: 'guard_unknown_action', severity: 'critical', message: `Unknown actionType: ${action.actionType}` })
      safe = false
    }

    for (const pattern of forbiddenWords) {
      if (pattern.test(action.label)) {
        issues.push({ id: 'guard_forbidden_label', severity: 'critical', message: `Action label contains forbidden word: ${action.label}` })
        safe = false
      }
      if (pattern.test(action.actionType)) {
        issues.push({ id: 'guard_forbidden_type', severity: 'critical', message: `Action type contains forbidden word: ${action.actionType}` })
        safe = false
      }
    }
  }

  if (viewModel.statusSeverity === 'good' && viewModel.blockers.length > 0) {
    issues.push({ id: 'guard_good_but_blocked', severity: 'critical', message: 'Status is good despite having blockers.' })
    safe = false
  }

  return {
    safe,
    issues
  }
}
