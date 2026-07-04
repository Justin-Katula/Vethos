import type {
  ExecutionPreviewDataSourceReport,
  ExecutionPreviewProviderState,
} from '@shared/execution-preview-data-connector-model'
import { ExecutionPreviewDataConnectorFlags } from '@shared/execution-preview-data-connector-flags'
import { ExecutionPreviewFlags } from '@shared/execution-preview-flags'
import { buildExecutionPreviewRawSnapshot } from './execution-preview-readonly-snapshot'
import { sanitizeExecutionPreviewSnapshot } from './execution-preview-snapshot-sanitizer'
import { runExecutionPreviewProposedPipeline } from './execution-preview-proposed-pipeline-runner'
import { runExecutionPreviewDataConnectorDiagnostics } from './execution-preview-data-connector-diagnostics'
import { normalizeExecutionPreviewSessions } from './execution-preview-session-normalizer'

export type BuildPreviewFromReadOnlyDataInput = {
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
  dateRange: {
    startDate: string
    endDate: string
  }
  now?: string
  idFactory?: () => string
}

export function buildExecutionPreviewFromReadOnlyData(
  input: BuildPreviewFromReadOnlyDataInput
): ExecutionPreviewProviderState {
  const { now, idFactory, dateRange, ...rawData } = input

  // Point 10 — Flag de rollback principal : si executionPreviewV2Enabled est false,
  // le pipeline de prévisualisation est désactivé et on retourne un état inactif
  // sans rien construire. Cela rend le flag réellement consommé (il ne l'était pas
  // avant) et permet un rollback global du pipeline.
  if (
    !ExecutionPreviewFlags.executionPreviewV2Enabled ||
    !ExecutionPreviewDataConnectorFlags.executionPreviewDataConnectorEnabled ||
    !ExecutionPreviewDataConnectorFlags.executionPreviewDataProviderEnabled
  ) {
    return {
      status: 'idle',
      previewPlan: undefined,
      lastBuildAt: now ?? new Date().toISOString(),
      warnings: ['Pipeline de prévisualisation désactivé (executionPreviewV2Enabled=false).'],
      errors: [],
      canGeneratePreview: false,
      canApplyPreview: false,
      confidence: 0,
    }
  }

  // 1. Raw Snapshot
  const rawSnapshot = buildExecutionPreviewRawSnapshot({
    ...rawData,
    sessions: normalizeExecutionPreviewSessions(rawData.sessions),
    now,
    sourceReports: rawData.sourceReports ?? [],
  })
  const rawSnapshotBaseline = structuredClone(rawSnapshot)

  // 2. Sanitize Snapshot
  const sanitizedSnapshot = sanitizeExecutionPreviewSnapshot({
    rawSnapshot,
    dateRange,
    now,
  })

  // 3. Proposed Pipeline Runner
  const pipelineResult = runExecutionPreviewProposedPipeline({
    snapshot: sanitizedSnapshot,
    now,
    idFactory,
  })

  // 4. Map to Provider State
  const qaInputSummary = {
    sourceCounts: {
      tasks: rawSnapshot.tasks.length,
      objectives: rawSnapshot.objectives.length,
      schedules: rawSnapshot.schedules.length,
      sessions: rawSnapshot.sessions.length,
      apps: rawSnapshot.apps.length,
      sites: rawSnapshot.sites.length
    },
    sanitizedCounts: {
      tasks: sanitizedSnapshot.tasks.length,
      objectives: sanitizedSnapshot.objectives.length,
      schedules: sanitizedSnapshot.schedules.length,
      sessions: sanitizedSnapshot.sessions.length,
      apps: sanitizedSnapshot.apps.length,
      sites: sanitizedSnapshot.sites.length
    },
    dataWarnings: [...rawSnapshot.warnings, ...sanitizedSnapshot.warnings],
    pipelineWarnings: pipelineResult.warnings,
    pipelineErrors: pipelineResult.errors,
    pipelineMode: pipelineResult.mode,
    providerStatus: '', // will be set below
    capturedAt: rawSnapshot.capturedAt,
    sanitizedAt: sanitizedSnapshot.metadata.sanitizedAt,
    confidence: Math.min(rawSnapshot.confidence, sanitizedSnapshot.confidence, pipelineResult.confidence)
  }

  let status: ExecutionPreviewProviderState['status'] = 'idle'
  if (pipelineResult.mode === 'unsafe') {
    status = 'unsafe'
  } else if (pipelineResult.mode === 'partial_preview') {
    status = 'partial'
  } else if (pipelineResult.errors.length > 0) {
    status = 'failed'
  } else if (pipelineResult.warnings.length > 0) {
    status = 'ready_with_warnings'
  } else {
    status = 'ready'
  }

  qaInputSummary.providerStatus = status



  const providerState: ExecutionPreviewProviderState = {
    status,
    previewPlan: pipelineResult.previewPlan,
    lastBuildAt: now ?? new Date().toISOString(),
    warnings: [...new Set([
      ...rawSnapshot.warnings,
      ...sanitizedSnapshot.warnings,
      ...pipelineResult.warnings,
    ])],
    errors: pipelineResult.errors,
    canGeneratePreview: ExecutionPreviewDataConnectorFlags.executionPreviewManualGenerateEnabled,
    canApplyPreview: false,
    qaInputSummary,
    confidence: pipelineResult.confidence,
  }

  const diagnostics = runExecutionPreviewDataConnectorDiagnostics({
    rawSnapshot,
    rawSnapshotBaseline,
    sanitizedSnapshot,
    providerState,
  })
  if (diagnostics.status === 'critical') {
    return {
      ...providerState,
      status: 'unsafe',
      previewPlan: undefined,
      diagnostics,
      errors: [...providerState.errors, ...diagnostics.issues
        .filter((issue) => issue.severity === 'critical')
        .map((issue) => issue.message)],
      canApplyPreview: false,
    }
  }

  return { ...providerState, diagnostics, canApplyPreview: false }
}
