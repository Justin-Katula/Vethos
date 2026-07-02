import type {
  ExecutionPreviewRawSnapshot,
  ExecutionPreviewSanitizedSnapshot,
} from '@shared/execution-preview-data-connector-model'

export type SanitizeSnapshotInput = {
  rawSnapshot: ExecutionPreviewRawSnapshot
  dateRange?: {
    startDate: string
    endDate: string
  }
  now?: string
}

export function sanitizeExecutionPreviewSnapshot(
  input: SanitizeSnapshotInput
): ExecutionPreviewSanitizedSnapshot {
  const sanitizedAt = input.now ?? new Date().toISOString()
  const raw = input.rawSnapshot
  const warnings: string[] = [...raw.warnings]
  let confidence = raw.confidence

  // User Validation
  if (!raw.userId) {
    warnings.push("Sanitizer: Le userId est manquant. Le snapshot est invalide pour la génération.")
    confidence = 0
  }

  // DateRange Validation
  let startDate = ''
  let endDate = ''
  if (input.dateRange?.startDate && input.dateRange?.endDate) {
    startDate = input.dateRange.startDate
    endDate = input.dateRange.endDate
  } else {
    // Fallback: today -> tomorrow
    const dNow = input.now ? new Date(input.now) : new Date()
    startDate = dNow.toISOString().slice(0, 10)
    dNow.setDate(dNow.getDate() + 1)
    endDate = dNow.toISOString().slice(0, 10)
    warnings.push(`Sanitizer: dateRange manquant, fallback utilisé : ${startDate} -> ${endDate}`)
  }

  // Filter tasks - minimal check
  const tasks = raw.tasks.filter((t: any) => t && typeof t === 'object' && t.id)
  if (tasks.length < raw.tasks.length) {
    warnings.push(`Sanitizer: ${raw.tasks.length - tasks.length} tâches ont été ignorées car invalides.`)
    confidence -= 5
  }

  const objectives = raw.objectives.filter((o: any) => o && typeof o === 'object' && o.id)
  const schedules = raw.schedules.filter((s: any) => s && typeof s === 'object')
  const sessions = raw.sessions.filter((s: any) => s && typeof s === 'object')
  const apps = raw.apps.filter((a: any) => a && typeof a === 'object')
  const sites = raw.sites.filter((s: any) => s && typeof s === 'object')

  return {
    userId: raw.userId ?? 'MISSING_USER_ID',
    tasks,
    objectives,
    schedules,
    sessions,
    apps,
    sites,
    settings: raw.settings,
    dateRange: { startDate, endDate },
    warnings,
    confidence: Math.max(0, confidence),
    metadata: {
      source: 'read_only_store_snapshot',
      capturedAt: raw.capturedAt,
      sanitizedAt,
    },
  }
}
