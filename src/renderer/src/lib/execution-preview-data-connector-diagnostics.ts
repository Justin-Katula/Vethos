import type {
  ExecutionPreviewRawSnapshot,
  ExecutionPreviewSanitizedSnapshot,
  ExecutionPreviewProviderState,
  ExecutionPreviewDataConnectorDiagnostics,
} from '@shared/execution-preview-data-connector-model'

function hasInvalidNumber(obj: any): boolean {
  if (typeof obj === 'number') return Number.isNaN(obj) || !Number.isFinite(obj)
  if (Array.isArray(obj)) return obj.some(hasInvalidNumber)
  if (obj && typeof obj === 'object') return Object.values(obj).some(hasInvalidNumber)
  return false
}

export type ConnectorDiagnosticsInput = {
  rawSnapshot?: ExecutionPreviewRawSnapshot
  sanitizedSnapshot?: ExecutionPreviewSanitizedSnapshot
  providerState?: ExecutionPreviewProviderState
}

export function runExecutionPreviewDataConnectorDiagnostics(
  input: ConnectorDiagnosticsInput
): ExecutionPreviewDataConnectorDiagnostics {
  const issues: ExecutionPreviewDataConnectorDiagnostics['issues'] = []
  const summary: string[] = []
  let hasCritical = false
  let hasWarning = false

  const { rawSnapshot, sanitizedSnapshot, providerState } = input

  if (!rawSnapshot && !sanitizedSnapshot && !providerState) {
    return {
      status: 'warning',
      issues: [{ id: 'empty_input', severity: 'medium', message: 'Aucune donnée fournie pour le diagnostic.' }],
      summary: ['Aucun diagnostic possible.'],
    }
  }

  // Vérifier la présence du userId
  if (rawSnapshot && !rawSnapshot.userId) {
    issues.push({
      id: 'missing_user_id',
      severity: 'high',
      message: 'Le userId est absent du snapshot brut.',
    })
    hasWarning = true
  }

  // Vérifier les tâches/objectifs
  if (sanitizedSnapshot) {
    if (sanitizedSnapshot.tasks.length === 0) {
      issues.push({
        id: 'no_tasks',
        severity: 'medium',
        message: 'Aucune tâche dans le snapshot.',
      })
      hasWarning = true
    }
    if (sanitizedSnapshot.objectives.length === 0) {
      issues.push({
        id: 'no_objectives',
        severity: 'low',
        message: 'Aucun objectif dans le snapshot.',
      })
    }
    if (sanitizedSnapshot.schedules.length === 0) {
      issues.push({
        id: 'no_schedules',
        severity: 'high',
        message: 'Le planning est absent.',
      })
      hasWarning = true
    }
    // NaN / Infinity check dans le snapshot
    if (hasInvalidNumber(sanitizedSnapshot)) {
      issues.push({
        id: 'invalid_number_format',
        severity: 'critical',
        message: 'Des valeurs NaN ou Infinity ont été détectées.',
      })
      hasCritical = true
    }
  }

  // Vérifier le provider state
  if (providerState) {
    if (providerState.canApplyPreview === true as any) {
      issues.push({
        id: 'can_apply_preview_true',
        severity: 'critical',
        message: 'Violation de sécurité: canApplyPreview est true.',
      })
      hasCritical = true
    }

    if (providerState.previewPlan?.readiness.canApplyLater === true) {
      issues.push({
        id: 'can_apply_later_true',
        severity: 'critical',
        message: 'Violation de sécurité: previewPlan.canApplyLater est true.',
      })
      hasCritical = true
    }

    if (providerState.status === 'ready' && !providerState.previewPlan) {
      issues.push({
        id: 'ready_but_no_plan',
        severity: 'high',
        message: "Le statut est 'ready' mais aucun previewPlan n'est fourni.",
      })
      hasWarning = true
    }

    if (providerState.errors.length > 0 && providerState.status !== 'failed' && providerState.status !== 'partial' && providerState.status !== 'unsafe') {
      issues.push({
        id: 'errors_without_failed_status',
        severity: 'high',
        message: 'Des erreurs sont présentes sans statut failed/partial/unsafe.',
      })
      hasWarning = true
    }
  }

  summary.push(`${issues.length} problème(s) détecté(s).`)

  return {
    status: hasCritical ? 'critical' : hasWarning ? 'warning' : 'healthy',
    issues,
    summary,
  }
}
