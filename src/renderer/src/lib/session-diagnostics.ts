import type { SessionPlanV2, SessionDiagnostics, SessionDiagnosticIssue } from '@shared/session-model'

export function runSessionDiagnostics(sessionPlan: SessionPlanV2): SessionDiagnostics {
  const issues: SessionDiagnosticIssue[] = []
  const summary: string[] = []

  // NaN/Infinity Checks
  if (!isFinite(sessionPlan.plannedDurationMinutes)) {
    issues.push({ id: 'invalid_duration_nan', severity: 'critical', message: 'plannedDurationMinutes is NaN or Infinity.' })
  }

  // Duration
  if (sessionPlan.plannedDurationMinutes <= 0) {
    issues.push({ id: 'invalid_duration_zero', severity: 'critical', message: 'plannedDurationMinutes <= 0.' })
  }

  // Dates
  if (sessionPlan.plannedStart >= sessionPlan.plannedEnd) {
    issues.push({ id: 'invalid_times', severity: 'critical', message: 'plannedStart >= plannedEnd.' })
  }

  // Target missing
  if (!sessionPlan.targetId) {
    issues.push({ id: 'missing_target_id', severity: 'critical', message: 'targetId est manquant.' })
  }

  // Strategy Block marking completion
  if (sessionPlan.targetType === 'strategy_block' && sessionPlan.contract.allowedToMarkTaskCompleted) {
    issues.push({ id: 'strategy_block_completion_bug', severity: 'critical', message: 'Un strategy_block ne peut pas avoir allowedToMarkTaskCompleted=true.' })
  }

  // Completion Gate without closure
  if (sessionPlan.contract.completionPolicy === 'completion_gate' && !sessionPlan.closure.required) {
    issues.push({ id: 'completion_gate_closure_bug', severity: 'critical', message: 'Une policy completion_gate nécessite une closure obligatoire.' })
  }

  // Strict allowlist without useful apps
  if (
    sessionPlan.protection.mode === 'strict_allowlist' &&
    sessionPlan.protection.usefulApps.length === 0 &&
    sessionPlan.protection.usefulSites.length === 0
  ) {
    issues.push({ id: 'strict_allowlist_empty', severity: 'medium', message: 'strict_allowlist activé mais aucune application ou site utile défini.' })
  }

  // High protection without unlock policy
  if (sessionPlan.protection.protectionLevel > 80 && sessionPlan.protection.unlockPolicy === 'none') {
    issues.push({ id: 'high_protection_no_unlock', severity: 'critical', message: 'Protection élevée (>80) sans politique de déblocage.' })
  }

  // Ready despite blockers
  if (sessionPlan.preflight.blockers.length > 0 && sessionPlan.preflight.readiness === 'ready') {
    issues.push({ id: 'ready_with_blockers_bug', severity: 'critical', message: 'Session marquée ready malgré la présence de bloqueurs.' })
  }

  // ShouldMarkTaskCompleted=true without completion gate approval (not testable easily on plan creation, but good for outcome engine)
  // We can't check outcome here since this is just the plan.

  let status: 'healthy' | 'warning' | 'critical' = 'healthy'
  if (issues.length > 0) {
    if (issues.some(i => i.severity === 'critical')) {
      status = 'critical'
    } else {
      status = 'warning'
    }
  }

  if (status === 'critical') summary.push("Le plan de session contient des incohérences critiques.")
  else if (status === 'warning') summary.push("Le plan de session contient des avertissements mineurs.")
  else summary.push("Plan de session sain.")

  return {
    status,
    issues,
    summary
  }
}
