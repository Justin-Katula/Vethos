import type { RuntimeCoordinatorPlanV2 } from '@shared/runtime-coordinator-model'

export function runRuntimeCoordinatorDiagnostics(
  plan: Omit<RuntimeCoordinatorPlanV2, 'diagnostics'>,
): RuntimeCoordinatorPlanV2['diagnostics'] {
  const issues: NonNullable<RuntimeCoordinatorPlanV2['diagnostics']>['issues'] = []
  let status: NonNullable<RuntimeCoordinatorPlanV2['diagnostics']>['status'] = 'healthy'

  const { blockingProfileDraft, closureBridgePlan, signalBridgePlan, safety } = plan

  if (blockingProfileDraft.mode === 'strict_allowlist' && blockingProfileDraft.apps.allow.length === 0) {
    issues.push({
      id: 'empty_strict_allowlist',
      severity: 'high',
      message: 'Strict allowlist mode is enabled but no apps are allowed.',
      suggestion: 'Add at least one application to the allowlist or change the mode.',
    })
    status = 'warning'
  }

  if (blockingProfileDraft.apps.block.map((a) => a.toLowerCase()).includes('vethos.exe')) {
    issues.push({
      id: 'vethos_blocked',
      severity: 'critical',
      message: 'Vethos.exe is present in the blocklist.',
    })
    status = 'critical'
  }

  if (blockingProfileDraft.overlayBehavior.shouldAvoidKillProcess === false) {
    issues.push({
      id: 'avoid_kill_false',
      severity: 'critical',
      message: 'shouldAvoidKillProcess is set to false, which violates Point 9 safety rules.',
    })
    status = 'critical'
  }

  if (blockingProfileDraft.overlayBehavior.preferredMethod !== 'attached_overlay_existing_system') {
    issues.push({
      id: 'invalid_overlay_method',
      severity: 'critical',
      message: 'Overlay method must be attached_overlay_existing_system.',
    })
    status = 'critical'
  }

  if (blockingProfileDraft.mediaBehavior.scope !== 'target_app_only') {
    issues.push({
      id: 'invalid_media_scope',
      severity: 'critical',
      message: 'Media behavior scope must be target_app_only.',
    })
    status = 'critical'
  }

  if (closureBridgePlan.shouldApplyOutcomeToTaskStoreNow !== false) {
    issues.push({
      id: 'immediate_task_store_mutation',
      severity: 'critical',
      message: 'shouldApplyOutcomeToTaskStoreNow must be false.',
    })
    status = 'critical'
  }

  if (!signalBridgePlan) {
    issues.push({
      id: 'missing_signal_bridge',
      severity: 'high',
      message: 'Signal Bridge Plan is missing.',
    })
    if (status !== 'critical') status = 'warning'
  }

  if (safety.status === 'critical' && plan.mode === 'ready_for_preview') {
    issues.push({
      id: 'critical_safety_with_ready_mode',
      severity: 'critical',
      message: 'The safety report is critical, but the coordinator mode is ready_for_preview.',
    })
    status = 'critical'
  }

  if (plan.confidence < 0.5 && plan.mode !== 'low_confidence' && plan.mode !== 'manual_review_required' && plan.mode !== 'unsafe') {
    issues.push({
      id: 'low_confidence_unhandled',
      severity: 'medium',
      message: 'Plan has low confidence but mode is not low_confidence.',
    })
    if (status === 'healthy') status = 'warning'
  }

  const summary = issues.map((i) => `[${i.severity.toUpperCase()}] ${i.message}`)

  return {
    status,
    issues,
    summary,
  }
}
