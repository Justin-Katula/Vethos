import type { ExecutionPreviewInputPayload } from './execution-preview-input-adapter'
import type { ExecutionPreviewPlanV2, ExecutionPreviewStatus, ExecutionPreviewMode } from '@shared/execution-preview-model'
import { buildExecutionPreviewInput } from './execution-preview-input-adapter'
import { resolveExecutionPreviewDependencies } from './execution-preview-dependency-resolver'
import { createPreviewPipelineTrace, appendPreviewPipelineStep } from './execution-preview-pipeline-trace'
import { buildExecutionPreviewDays } from './execution-preview-day-builder'
import { runExecutionPreviewSafetyCheck } from './execution-preview-safety-engine'
import { runExecutionPreviewReadinessGate } from './execution-preview-readiness-gate'
import { explainExecutionPreviewPlan } from './execution-preview-explanation-engine'
import { runExecutionPreviewDiagnostics } from './execution-preview-diagnostics'

export function buildExecutionPreviewPlanV2(inputPayload: ExecutionPreviewInputPayload): ExecutionPreviewPlanV2 {
  const trace = createPreviewPipelineTrace()

  // 1. Adapter
  const adaptedInput = buildExecutionPreviewInput(inputPayload)
  appendPreviewPipelineStep(trace, {
    id: 's1', name: 'input_adaptation',
    status: adaptedInput.warnings.length ? 'success_with_warnings' : 'success',
    reason: 'Input adapted.', warnings: adaptedInput.warnings, confidence: adaptedInput.confidence
  })

  // 2. Dependencies
  const dependencies = resolveExecutionPreviewDependencies(adaptedInput)
  const missing = dependencies.filter(d => d.status === 'missing' && d.required)
  appendPreviewPipelineStep(trace, {
    id: 's2', name: 'dependency_resolution',
    status: missing.length ? 'success_with_warnings' : 'success',
    reason: missing.length ? 'Missing dependencies detected.' : 'All dependencies available.',
    warnings: missing.map(m => `Missing: ${m.name}`),
    confidence: Math.min(...dependencies.map(d => d.confidence))
  })

  // 3. Days Builder
  const days = buildExecutionPreviewDays(adaptedInput)
  appendPreviewPipelineStep(trace, {
    id: 's3', name: 'placement',
    status: 'success', reason: 'Days built.', warnings: [], confidence: 100
  })

  // 4. Safety
  const safety = runExecutionPreviewSafetyCheck({ ...adaptedInput, days })
  appendPreviewPipelineStep(trace, {
    id: 's4', name: 'safety_check',
    status: safety.status === 'safe' ? 'success' : (safety.status === 'critical' ? 'failed' : 'success_with_warnings'),
    reason: 'Safety check completed.', warnings: safety.warnings, confidence: safety.confidence
  })

  // 5. Readiness
  const readiness = runExecutionPreviewReadinessGate({ dependencies, days, safety, settings: adaptedInput.settings })
  appendPreviewPipelineStep(trace, {
    id: 's5', name: 'readiness_gate',
    status: readiness.readiness === 'ready_for_debug_preview' || readiness.readiness === 'ready_for_ui_preview' ? 'success' : 'success_with_warnings',
    reason: `Gate result: ${readiness.readiness}`, warnings: readiness.warnings, confidence: readiness.confidence
  })

  // Summaries
  let totalPreviewBlocks = 0
  let totalProposedMinutes = 0
  let totalBlocked = 0
  let totalUnsafe = 0

  for (const day of days) {
    totalPreviewBlocks += day.blocks.length
    totalProposedMinutes += day.summary.proposedWorkMinutes
    totalBlocked += day.summary.blockedOrUnsafeCount
  }
  if (safety.status === 'critical') totalUnsafe++

  // Prepare partial plan for Explanation and Diagnostics
  const idFactory = adaptedInput.idFactory ?? (() => crypto.randomUUID())
  const now = adaptedInput.now ?? new Date().toISOString()
  
  const executionEnabled =
    typeof adaptedInput.settings === 'object' &&
    adaptedInput.settings !== null &&
    'engineV2Execution' in adaptedInput.settings &&
    adaptedInput.settings.engineV2Execution === true
  let mode: ExecutionPreviewMode = executionEnabled ? 'ui_preview' : 'debug_preview'
  let status: ExecutionPreviewStatus = 'ready_for_preview'

  if (safety.status === 'critical') {
    mode = 'unsafe'
    status = 'blocked_by_safety'
  } else if (readiness.readiness === 'blocked') {
    status = 'blocked_by_missing_dependencies'
  } else if (readiness.readiness === 'manual_review_required') {
    mode = 'manual_review_required'
    status = 'manual_review_required'
  } else if (readiness.readiness === 'partial_preview_only') {
    status = 'partial_preview'
  }

  const confidence = trace.confidence

  const partialPlan: Omit<ExecutionPreviewPlanV2, 'explanation' | 'diagnostics'> = {
    id: idFactory(),
    userId: adaptedInput.userId,
    dateRange: adaptedInput.dateRange,
    mode,
    status,
    dependencies,
    days,
    sessionPlanIds: adaptedInput.sessionPlansV2.map((s: any) => s.id),
    runtimeCoordinatorPlanIds: adaptedInput.runtimeCoordinatorPlansV2.map((r: any) => r.id),
    readiness,
    safety,
    pipelineTrace: trace,
    summary: {
      totalPreviewBlocks,
      totalProposedMinutes,
      totalWarnings: trace.warningStepIds.length,
      totalBlocked,
      totalManualReview: 0,
      totalUnsafe
    },
    confidence,
    metadata: {
      modelVersion: 1,
      createdAt: now,
      updatedAt: now,
      source: 'execution_preview'
    }
  }

  // 6. Explanation
  const explanation = explainExecutionPreviewPlan(partialPlan as any)
  
  // 7. Diagnostics
  const planWithExp = { ...partialPlan, explanation }
  const diagnostics = runExecutionPreviewDiagnostics(planWithExp)

  // Double check readiness/status if diagnostics are critical
  if (diagnostics.status === 'critical' && status !== 'blocked_by_safety') {
    status = 'blocked_by_invalid_inputs'
    mode = 'manual_review_required'
  }

  return {
    ...planWithExp,
    status,
    mode,
    diagnostics
  }
}
