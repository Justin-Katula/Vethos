import { ExecutionPreviewProviderState } from '@shared/execution-preview-data-connector-model'
import { ExecutionPreviewPlanV2 } from '@shared/execution-preview-model'
import { ExecutionPreviewQaReport, ExecutionPreviewQaCheck } from '@shared/execution-preview-qa-model'
import { runExecutionPreviewMappingAudit } from './execution-preview-mapping-audit'
import { runExecutionPreviewConsistencyChecks } from './execution-preview-consistency-checks'
import { runExecutionPreviewCalibration } from './execution-preview-calibration-engine'
import { calculateExecutionPreviewQualityScore } from './execution-preview-quality-score'
import { runExecutionPreviewQaDiagnostics } from './execution-preview-qa-diagnostics'
import { explainExecutionPreviewQaReport } from './execution-preview-qa-explanation'

export type QaEngineInput = {
  providerState?: ExecutionPreviewProviderState
  previewPlan?: ExecutionPreviewPlanV2
  settings?: any
  now?: string
  idFactory?: () => string
}

export function runExecutionPreviewQa(
  input: QaEngineInput
): ExecutionPreviewQaReport {
  const { providerState, previewPlan, now, idFactory, settings } = input
  const generatedId = idFactory ? idFactory() : `qa-report-${Date.now()}`
  const createdAt = now ?? new Date().toISOString()

  // 1. Mapping Audit
  const mappingAudit = runExecutionPreviewMappingAudit({
    qaInputSummary: providerState?.qaInputSummary,
    previewPlan,
  })

  // 2. Consistency Checks
  const consistency = runExecutionPreviewConsistencyChecks({
    providerState,
    previewPlan,
    settings,
  })

  // 3. Calibration Engine
  const calibration = runExecutionPreviewCalibration({
    mappingAudit,
    consistency,
    providerState,
  })

  // 4. Quality Score
  const qualityScore = calculateExecutionPreviewQualityScore({
    mappingAudit,
    consistency,
    calibration,
    previewPlan,
    providerState,
  })

  // 5. Build preliminary report to pass to diagnostics
  const allChecks: ExecutionPreviewQaCheck[] = [
    ...consistency.checks,
    ...calibration.findings
  ]

  const blockers = consistency.checks.filter(c => c.severity === 'critical').map(c => c.message)
  if (providerState?.qaInputSummary?.pipelineErrors) {
    blockers.push(...providerState.qaInputSummary.pipelineErrors)
  }

  const warnings = consistency.checks.filter(c => c.severity === 'high' || c.severity === 'medium').map(c => c.message)
  if (providerState?.qaInputSummary?.pipelineWarnings) {
    warnings.push(...providerState.qaInputSummary.pipelineWarnings)
  }

  const baseReport: Partial<ExecutionPreviewQaReport> = {
    id: generatedId,
    previewPlanId: previewPlan?.id,
    status: qualityScore.status,
    qualityScore,
    mappingAudit,
    consistency,
    calibration,
    checks: allChecks,
    canProceedToActivationPlanning: false,
    warnings,
    blockers,
    confidence: providerState?.confidence ?? 100
  }

  // 6. Diagnostics
  const diagnostics = runExecutionPreviewQaDiagnostics({
    qaReport: baseReport,
    mappingAudit,
    consistency,
    calibration,
    qualityScore
  })

  // 7. Explanation
  const explanation = explainExecutionPreviewQaReport(baseReport as ExecutionPreviewQaReport)

  return {
    ...baseReport,
    diagnostics,
    explanation,
    metadata: {
      source: 'execution_preview_qa',
      createdAt,
      modelVersion: 1
    }
  } as ExecutionPreviewQaReport
}
