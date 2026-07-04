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
  userModel?: unknown
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

  const tasks = cloneArray(input.tasks, 'tasks', warnings)
  if (tasks.length === 0) {
    warnings.push("Aucune tâche trouvée dans les données brutes.")
    confidence -= 10
  }

  const objectives = cloneArray(input.objectives, 'objectives', warnings)
  const schedules = cloneArray(input.schedules, 'schedules', warnings)
  if (schedules.length === 0) {
    warnings.push("Aucune règle de planning trouvée.")
    confidence -= 20
  }

  const sessions = cloneArray(input.sessions, 'sessions', warnings)
  const apps = cloneArray(input.apps, 'apps', warnings)
  const sites = cloneArray(input.sites, 'sites', warnings)
  const sourceReports = cloneArray(input.sourceReports, 'sourceReports', warnings) as ExecutionPreviewDataSourceReport[]

  return {
    userId: input.userId,
    tasks,
    objectives,
    schedules,
    sessions,
    apps,
    sites,
    settings: cloneOptional(input.settings, 'settings', warnings),
    auth: cloneOptional(input.auth, 'auth', warnings),
    userModel: cloneOptional(input.userModel, 'userModel', warnings),
    sourceReports,
    capturedAt,
    warnings,
    confidence: Math.max(0, confidence),
  }
}

function cloneArray(value: unknown[] | undefined, path: string, warnings: string[]): unknown[] {
  if (!Array.isArray(value)) return []
  return value.map((item, index) => toSerializable(item, `${path}[${index}]`, warnings, new WeakSet()))
}

function cloneOptional(value: unknown, path: string, warnings: string[]): unknown {
  return value === undefined ? undefined : toSerializable(value, path, warnings, new WeakSet())
}

function toSerializable(
  value: unknown,
  path: string,
  warnings: string[],
  seen: WeakSet<object>,
): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return value
    warnings.push(`Snapshot: valeur numérique non finie retirée à ${path}.`)
    return null
  }
  if (typeof value === 'undefined') return null
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
    warnings.push(`Snapshot: valeur non sérialisable retirée à ${path}.`)
    return null
  }
  if (value instanceof Date) return value.toISOString()
  if (typeof value !== 'object') return null
  if (seen.has(value)) {
    warnings.push(`Snapshot: référence circulaire retirée à ${path}.`)
    return null
  }
  seen.add(value)
  if (Array.isArray(value)) {
    return value.map((item, index) => toSerializable(item, `${path}[${index}]`, warnings, seen))
  }
  const output: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    output[key] = toSerializable(child, `${path}.${key}`, warnings, seen)
  }
  return output
}
