import { ExecutionPreviewUiFlags } from '@shared/execution-preview-ui-flags'
import type { ExecutionPreviewActionType, ExecutionPreviewViewModel } from './execution-preview-view-model'

export interface ExecutionPreviewGuardResult {
  safe: boolean
  issues: Array<{ id: string; severity: 'low' | 'medium' | 'high' | 'critical'; message: string }>
}

const validActionTypes = new Set<ExecutionPreviewActionType>([
  'debug_only', 'manual_review', 'fix_inputs', 'rebuild_proposed',
  'disabled_apply', 'disabled_start_session', 'disabled_blocking',
])
const dangerousActionTypes = new Set<ExecutionPreviewActionType>([
  'disabled_apply', 'disabled_start_session', 'disabled_blocking',
])

export function guardExecutionPreviewActions(viewModel: ExecutionPreviewViewModel): ExecutionPreviewGuardResult {
  const issues: ExecutionPreviewGuardResult['issues'] = []
  if (
    ExecutionPreviewUiFlags.executionPreviewUiControlsApply ||
    ExecutionPreviewUiFlags.executionPreviewUiControlsStartSession ||
    ExecutionPreviewUiFlags.executionPreviewUiControlsBlocking ||
    ExecutionPreviewUiFlags.executionPreviewUiControlsTaskCompletion ||
    ExecutionPreviewUiFlags.executionPreviewUiControlsPlanningStore ||
    ExecutionPreviewUiFlags.executionPreviewUiControlsAutoBuildPipeline
  ) {
    issues.push({ id: 'ui_control_flag_enabled', severity: 'critical', message: 'Un contrôle d’écriture du Point 11 est actif.' })
  }

  for (const action of viewModel.actions) {
    const actionType = action.actionType as string
    if (!validActionTypes.has(action.actionType)) {
      issues.push({ id: `unknown_action_type_${actionType}`, severity: 'critical', message: `Type d’action inconnu : ${actionType}.` })
      continue
    }
    if (dangerousActionTypes.has(action.actionType) && action.enabled) {
      issues.push({ id: `dangerous_action_enabled_${action.actionType}`, severity: 'critical', message: `L’action dangereuse ${action.actionType} est activée.` })
    }
    const runtimeAction = action as unknown as Record<string, unknown>
    if (typeof runtimeAction.handler === 'function' || typeof runtimeAction.onClick === 'function') {
      issues.push({ id: `real_handler_present_${actionType}`, severity: 'critical', message: `Un handler réel est attaché à l’action ${actionType}.` })
    }
  }

  if (viewModel.guardFacts.realActionHandlerPresent) issues.push({ id: 'real_action_handler_present', severity: 'critical', message: 'Les données UI exposent un handler d’action réel.' })
  if (viewModel.guardFacts.canApplyLater) issues.push({ id: 'can_apply_later_true', severity: 'critical', message: 'Le plan source autorise canApplyLater alors que le Point 11 exige false.' })
  if (viewModel.guardFacts.safetyStatus === 'critical' && viewModel.status === 'ready') issues.push({ id: 'critical_safety_shown_as_ready', severity: 'critical', message: 'Une sécurité critique est présentée comme prête.' })

  const unsafe = viewModel.guardFacts.previewMode === 'unsafe' || viewModel.guardFacts.safetyStatus === 'unsafe' || viewModel.guardFacts.safetyStatus === 'critical' || viewModel.status === 'unsafe'
  if (unsafe && viewModel.actions.some((action) => action.enabled)) issues.push({ id: 'unsafe_preview_has_enabled_action', severity: 'critical', message: 'Une preview non sécurisée expose une action active.' })
  return { safe: issues.length === 0, issues }
}
