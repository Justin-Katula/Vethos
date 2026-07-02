import type { ExecutionPreviewProviderState } from '@shared/execution-preview-data-connector-model'
import { buildExecutionPreviewRawSnapshot } from './execution-preview-readonly-snapshot'
import { sanitizeExecutionPreviewSnapshot } from './execution-preview-snapshot-sanitizer'
import { runExecutionPreviewShadowPipeline } from './execution-preview-shadow-pipeline-runner'

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

  // 3. Shadow Pipeline Runner
  const pipelineResult = runExecutionPreviewShadowPipeline({
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
