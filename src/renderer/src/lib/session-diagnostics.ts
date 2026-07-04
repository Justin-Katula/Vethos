import type { CompletionGateResult } from '@shared/completion-gate'
import { sessionFlags } from '@shared/session-flags'
import type { SessionDiagnosticIssue, SessionDiagnostics, SessionOutcomeV2, SessionPlanV2 } from '@shared/session-model'

function containsNonFinite(value: unknown, seen = new Set<object>()): boolean {
  if (typeof value === 'number') return !Number.isFinite(value)
  if (!value || typeof value !== 'object') return false
  if (seen.has(value)) return false
  seen.add(value)
  return Object.values(value).some((nested) => containsNonFinite(nested, seen))
}

function instant(date: string, value: string): number {
  return /^\d{2}:\d{2}$/u.test(value)
    ? new Date(`${date}T${value}:00`).getTime()
    : new Date(value).getTime()
}

function completionGateApproved(result: CompletionGateResult | undefined): boolean {
  return Boolean(result?.verifiedCompleted && result.decision === 'accept_completion')
}

export function runSessionDiagnostics(
  sessionPlan: SessionPlanV2,
  outcome?: SessionOutcomeV2,
  completionGateResult?: CompletionGateResult,
): SessionDiagnostics {
  const issues: SessionDiagnosticIssue[] = []
  const add = (issue: SessionDiagnosticIssue) => issues.push(issue)
  const start = instant(sessionPlan.date, sessionPlan.plannedStart)
  const end = instant(sessionPlan.date, sessionPlan.plannedEnd)

  if (!Number.isFinite(sessionPlan.plannedDurationMinutes) || sessionPlan.plannedDurationMinutes <= 0) {
    add({ id: 'invalid_duration', severity: 'critical', message: 'plannedDurationMinutes doit être un nombre fini strictement positif.' })
  }
  if (Number.isFinite(start) && Number.isFinite(end) && start >= end) {
    add({ id: 'invalid_times', severity: 'critical', message: 'plannedStart doit précéder plannedEnd.' })
  }
  if (!sessionPlan.targetId) {
    add({ id: 'missing_target_id', severity: 'critical', message: 'targetId est manquant.' })
  }
  if (sessionPlan.targetType === 'task' && !sessionPlan.linkedTaskId) {
    add({ id: 'linked_task_missing', severity: 'high', message: 'La session cible une tâche introuvable.', targetId: sessionPlan.targetId })
  }
  if (sessionPlan.targetType === 'strategy_block' && sessionPlan.contract.allowedToMarkTaskCompleted) {
    add({ id: 'strategy_block_completion_bug', severity: 'critical', message: 'Un strategy_block ne peut jamais compléter une tâche.' })
  }
  if (sessionPlan.contract.completionPolicy === 'completion_gate' && !sessionPlan.closure.required) {
    add({ id: 'completion_gate_closure_bug', severity: 'critical', message: 'Un completion gate exige une clôture obligatoire.' })
  }
  const emptyStrictAllowlist =
    sessionPlan.protection.mode === 'strict_allowlist' &&
    sessionPlan.protection.usefulApps.length === 0 &&
    sessionPlan.protection.usefulSites.length === 0
  if (emptyStrictAllowlist && sessionPlan.protection.warnings.length === 0) {
    add({ id: 'strict_allowlist_empty_without_warning', severity: 'critical', message: 'L’allowlist stricte est vide sans avertissement explicite.' })
  } else if (emptyStrictAllowlist) {
    add({ id: 'strict_allowlist_empty', severity: 'medium', message: 'L’allowlist stricte est vide; le preflight doit demander les ressources utiles.' })
  }
  if (sessionPlan.protection.protectionLevel > 80 && sessionPlan.protection.unlockPolicy === 'none') {
    add({ id: 'high_protection_no_unlock', severity: 'critical', message: 'Une protection supérieure à 80 exige une politique de sortie.' })
  }
  if (sessionPlan.preflight.blockers.length > 0 && sessionPlan.preflight.readiness === 'ready') {
    add({ id: 'ready_with_blockers_bug', severity: 'critical', message: 'La session est marquée prête malgré des bloqueurs.' })
  }
  const missingCriticalData = !sessionPlan.linkedTaskId && sessionPlan.targetType === 'task'
  if (missingCriticalData && sessionPlan.confidence > 70) {
    add({ id: 'confidence_too_high', severity: 'high', message: 'La confiance est trop haute malgré des données critiques manquantes.' })
  }
  if (sessionPlan.protection.shouldUseOverlay && !sessionFlags.sessionControlsOverlay) {
    add({ id: 'overlay_disabled', severity: 'high', message: 'Le plan exige l’overlay alors que son contrôle runtime est désactivé.' })
  }
  if (outcome?.shouldMarkTaskCompleted && !completionGateApproved(completionGateResult)) {
    add({ id: 'completion_without_gate', severity: 'critical', message: 'Une complétion de tâche est demandée sans completion gate vérifié.' })
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    add({ id: 'invalid_dates', severity: 'critical', message: 'Les dates ou horaires de la session sont illisibles.' })
  }
  if (containsNonFinite(sessionPlan) || (outcome && containsNonFinite(outcome))) {
    add({ id: 'non_finite_output', severity: 'critical', message: 'Le résultat contient NaN ou Infinity et ne peut pas être sérialisé sûrement.' })
  }

  const status: SessionDiagnostics['status'] = issues.some((issue) => issue.severity === 'critical')
    ? 'critical'
    : issues.length > 0 ? 'warning' : 'healthy'
  return {
    status,
    issues,
    summary: [
      status === 'critical'
        ? 'Le plan de session contient une incohérence critique.'
        : status === 'warning'
          ? 'Le plan de session demande une vérification.'
          : 'Le plan de session est cohérent et sérialisable.',
    ],
  }
}
