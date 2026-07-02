import type {
  ExecutionPreviewRawSnapshot,
  ExecutionPreviewDataSourceReport,
} from '@shared/execution-preview-data-connector-model'

export type BuildRawSnapshotInput = {
  userId?: string
  tasks?: unknown[]
  objectives?: unknown[]
  schedules?: unknown[]
  sessions?: unknown[]
  apps?: unknown[]
  sites?: unknown[]
  settings?: unknown
  auth?: unknown
  sourceReports?: ExecutionPreviewDataSourceReport[]
  now?: string
}

export function buildExecutionPreviewRawSnapshot(
  input: BuildRawSnapshotInput
): ExecutionPreviewRawSnapshot {
  const capturedAt = input.now ?? new Date().toISOString()
  const warnings: string[] = []
  let confidence = 100

  if (!input.userId) {
    warnings.push("Le 'userId' n'est pas fourni. Le snapshot risque d'être rejeté par le sanitizer.")
    confidence -= 40
  }

  const tasks = Array.isArray(input.tasks) ? [...input.tasks] : []
  if (tasks.length === 0) {
    warnings.push("Aucune tâche trouvée dans les données brutes.")
    confidence -= 10
  }

  const objectives = Array.isArray(input.objectives) ? [...input.objectives] : []
  const schedules = Array.isArray(input.schedules) ? [...input.schedules] : []
  if (schedules.length === 0) {
    warnings.push("Aucune règle de planning trouvée.")
    confidence -= 20
  }

  const sessions = Array.isArray(input.sessions) ? [...input.sessions] : []
  const apps = Array.isArray(input.apps) ? [...input.apps] : []
  const sites = Array.isArray(input.sites) ? [...input.sites] : []
  const sourceReports = Array.isArray(input.sourceReports) ? [...input.sourceReports] : []

  return {
    userId: input.userId,
    tasks,
    objectives,
    schedules,
    sessions,
    apps,
    sites,
    settings: input.settings ? JSON.parse(JSON.stringify(input.settings)) : undefined, // Deep copy structured data
    auth: input.auth ? JSON.parse(JSON.stringify(input.auth)) : undefined,
    sourceReports,
    capturedAt,
    warnings,
    confidence: Math.max(0, confidence),
  }
}
