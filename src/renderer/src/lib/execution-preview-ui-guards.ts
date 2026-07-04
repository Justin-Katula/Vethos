import type { ExecutionPreviewViewModel } from './execution-preview-view-model'
import { ExecutionPreviewUiFlags } from '@shared/execution-preview-ui-flags'

export interface ExecutionPreviewGuardResult {
  safe: boolean
  issues: Array<{
    id: string
    severity: 'low' | 'medium' | 'high' | 'critical'
    message: string
  }>
}

export function guardExecutionPreviewActions(viewModel: ExecutionPreviewViewModel): ExecutionPreviewGuardResult {
  const issues: ExecutionPreviewGuardResult['issues'] = []

  // Global static flags check
  if (ExecutionPreviewUiFlags.executionPreviewUiControlsApply || ExecutionPreviewUiFlags.executionPreviewUiControlsStartSession || ExecutionPreviewUiFlags.executionPreviewUiControlsBlocking) {
    issues.push({
      id: 'ui_flags_unsafe',
      severity: 'critical',
      message: 'Les flags globaux d’application sont actifs, la UI ne doit pas s’afficher.'
    })
  }

  // Verify dangerous actions are disabled
  for (const action of viewModel.actions) {
    if (['disabled_apply', 'disabled_start_session', 'disabled_blocking'].includes(action.actionType)) {
      if (action.enabled === true) {
        issues.push({
          id: `dangerous_action_enabled_${action.actionType}`,
          severity: 'critical',
          message: `L'action dangereuse ${action.actionType} est activée.`
        })
      }
    }
  }

  // Status conflicts
  if (viewModel.status === 'unsafe') {
    const hasEnabledFixAction = viewModel.actions.some(a => a.enabled && !['debug_only', 'disabled_apply', 'disabled_start_session', 'disabled_blocking', 'rebuild_proposed'].includes(a.actionType))
    if (hasEnabledFixAction) {
      // Manual review/fix inputs can be enabled, but we just flag if it's strictly unsafe and not manual_review.
      // We'll allow manual review to be enabled, but let's check for any weird custom handlers
    }
  }

  return {
    safe: issues.length === 0,
    issues
  }
}
