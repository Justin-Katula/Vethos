import type { ExecutionPreviewProviderState } from '@shared/execution-preview-data-connector-model'
import { ExecutionPreviewFlags } from '@shared/execution-preview-flags'
import { buildExecutionPreviewRawSnapshot } from './execution-preview-readonly-snapshot'
import { sanitizeExecutionPreviewSnapshot } from './execution-preview-snapshot-sanitizer'
import { runExecutionPreviewProposedPipeline } from './execution-preview-proposed-pipeline-runner'

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
  if (!ExecutionPreviewFlags.executionPreviewV2Enabled) {
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
    now,
    sourceReports: [],
  })

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



  return {
    status,
    previewPlan: pipelineResult.previewPlan,
    lastBuildAt: now ?? new Date().toISOString(),
    warnings: pipelineResult.warnings,
    errors: pipelineResult.errors,
    canGeneratePreview: true,
    canApplyPreview: (input.settings as any)?.engineV2Execution === true && (status === 'ready' || status === 'ready_with_warnings'),
    qaInputSummary,
    confidence: pipelineResult.confidence,
  }
}
