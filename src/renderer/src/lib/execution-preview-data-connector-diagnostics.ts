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
  rawSnapshotBaseline?: ExecutionPreviewRawSnapshot
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

  const { rawSnapshot, rawSnapshotBaseline, sanitizedSnapshot, providerState } = input

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

  if (rawSnapshot && rawSnapshot.settings === undefined) {
    issues.push({
      id: 'missing_settings',
      severity: 'medium',
      message: 'Les réglages sont absents du snapshot brut.',
    })
    hasWarning = true
  }

  // Vérifier les tâches/objectifs
  if (sanitizedSnapshot) {
    if (!isValidDateRange(sanitizedSnapshot.dateRange)) {
      issues.push({
        id: 'invalid_date_range',
        severity: 'high',
        message: 'La plage de dates du snapshot nettoyé est invalide.',
      })
      hasWarning = true
    }
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

    if (rawSnapshot) {
      const rawCount = collectionCount(rawSnapshot)
      const sanitizedCount = collectionCount(sanitizedSnapshot)
      if (rawCount >= 4 && sanitizedCount / rawCount < 0.5) {
        issues.push({
          id: 'too_many_invalid_items',
          severity: 'high',
          message: 'Plus de la moitié des éléments du snapshot ont été rejetés par le nettoyage.',
        })
        hasWarning = true
      }
    }
  }


  if (rawSnapshot && rawSnapshotBaseline && stableJson(rawSnapshot) !== stableJson(rawSnapshotBaseline)) {
    issues.push({
      id: 'raw_snapshot_mutated',
      severity: 'critical',
      message: 'Le snapshot brut a été modifié après sa capture.',
    })
    hasCritical = true
  }

  // Vérifier le provider state
  if (providerState) {
    if ((providerState as { canApplyPreview?: boolean }).canApplyPreview === true) {
      issues.push({
        id: 'can_apply_preview_true',
        severity: 'critical',
        message: 'Violation de sécurité: canApplyPreview est true.',
      })
      hasCritical = true
    }

    if ((providerState.previewPlan?.readiness as { canApplyLater?: boolean } | undefined)?.canApplyLater === true) {
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


  const sensitivePaths = [
    ...findSensitivePaths(rawSnapshot, 'rawSnapshot'),
    ...findSensitivePaths(sanitizedSnapshot, 'sanitizedSnapshot'),
    ...findSensitivePaths(providerState?.previewPlan, 'previewPlan'),
  ]
  if (sensitivePaths.length > 0) {
    issues.push({
      id: 'unnecessary_sensitive_data',
      severity: 'critical',
      message: `Des données sensibles inutiles sont présentes dans la preview (${sensitivePaths.join(', ')}).`,
      suggestion: 'Ne conserver que les champs strictement nécessaires au calcul et à l’affichage.',
    })
    hasCritical = true
  }

  summary.push(`${issues.length} problème(s) détecté(s).`)

  return {
    status: hasCritical ? 'critical' : hasWarning ? 'warning' : 'healthy',
    issues,
    summary,
  }
}

function isValidDateRange(range: { startDate: string; endDate: string }): boolean {
  const start = new Date(range.startDate).getTime()
  const end = new Date(range.endDate).getTime()
  return Number.isFinite(start) && Number.isFinite(end) && start <= end
}

function collectionCount(snapshot: {
  tasks: unknown[]
  objectives: unknown[]
  schedules: unknown[]
  sessions: unknown[]
  apps: unknown[]
  sites: unknown[]
}): number {
  return snapshot.tasks.length + snapshot.objectives.length + snapshot.schedules.length +
    snapshot.sessions.length + snapshot.apps.length + snapshot.sites.length
}

function stableJson(value: unknown): string | undefined {
  try {
    return JSON.stringify(value)
  } catch {
    return undefined
  }
}

const sensitiveKeys = new Set([
  'password',
  'passphrase',
  'secret',
  'clientsecret',
  'apikey',
  'authorization',
  'cookie',
  'setcookie',
  'token',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'sessiontoken',
  'privatekey',
])

function findSensitivePaths(
  value: unknown,
  path: string,
  seen: WeakSet<object> = new WeakSet(),
): string[] {
  if (!value || typeof value !== 'object') return []
  if (seen.has(value)) return []
  seen.add(value)

  const entries = Array.isArray(value)
    ? value.map((item, index) => [String(index), item] as const)
    : Object.entries(value as Record<string, unknown>)
  const paths: string[] = []
  for (const [key, child] of entries) {
    const childPath = `${path}.${key}`
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (sensitiveKeys.has(normalizedKey) && child !== undefined && child !== null && child !== '') {
      paths.push(childPath)
      continue
    }
    paths.push(...findSensitivePaths(child, childPath, seen))
  }
  return paths
}
