import {
  ExecutionPreviewCalibrationReport,
  ExecutionPreviewConsistencyReport,
  ExecutionPreviewMappingAudit,
  ExecutionPreviewQualityScore
} from '@shared/execution-preview-qa-model'
import { ExecutionPreviewPlanV2 } from '@shared/execution-preview-model'
import { ExecutionPreviewProviderState } from '@shared/execution-preview-data-connector-model'

export type QualityScoreInput = {
  mappingAudit: ExecutionPreviewMappingAudit
  consistency: ExecutionPreviewConsistencyReport
  calibration: ExecutionPreviewCalibrationReport
  previewPlan?: ExecutionPreviewPlanV2
  providerState?: ExecutionPreviewProviderState
}

export function calculateExecutionPreviewQualityScore(
  input: QualityScoreInput
): ExecutionPreviewQualityScore {
  const { mappingAudit, consistency, calibration, previewPlan, providerState } = input
  const reasons: string[] = []

  let overall = 100
  let dataMapping = 100
  let planning = 100
  let placement = 100
  let session = 100
  let runtimeCoordination = 100
  let safety = 100
  let readability = 100

  // 1. Data Mapping
  if (mappingAudit.status === 'invalid') {
    dataMapping = 0
    reasons.push('Mapping status is invalid.')
  } else if (mappingAudit.status === 'weak') {
    dataMapping = 50
    reasons.push('Mapping status is weak.')
  } else if (mappingAudit.status === 'partial') {
    dataMapping = 80
    reasons.push('Mapping status is partial.')
  }

  // 2. Planning
  if (mappingAudit.planning.warnings.length > 0) {
    planning -= mappingAudit.planning.warnings.length * 10
    reasons.push('Planning warnings found.')
  }

  // 3. Consistency (affects multiple)
  if (consistency.status === 'critical') {
    placement = 0
    session = 0
    runtimeCoordination = 0
    safety = 0
    reasons.push('Critical consistency issues.')
  } else if (consistency.status === 'inconsistent') {
    placement = 50
    session = 50
    reasons.push('Inconsistencies detected.')
  } else if (consistency.status === 'warning') {
    placement = 90
    reasons.push('Consistency warnings.')
  }

  // 4. Calibration & Safety
  if (calibration.status === 'unsafe' || providerState?.status === 'unsafe' || previewPlan?.safety.status === 'unsafe') {
    safety = 0
    reasons.push('Safety is unsafe.')
  } else if (calibration.status === 'needs_major_adjustment') {
    safety = 50
    reasons.push('Needs major adjustment.')
  }

  // 5. Hard rules for safety
  if (previewPlan?.readiness.canApplyLater === true) {
    safety = 0
    reasons.push('canApplyLater is true (forbidden).')
  }

  if (providerState?.canApplyPreview === true) {
    safety = 0
    reasons.push('canApplyPreview is true (forbidden).')
  }

  if (!previewPlan) {
    placement = 0
    session = 0
    runtimeCoordination = 0
    reasons.push('No preview plan available.')
  }

  // Clamp values
  const clamp = (v: number) => Math.max(0, Math.min(100, isNaN(v) || !isFinite(v) ? 0 : v))

  dataMapping = clamp(dataMapping)
  planning = clamp(planning)
  placement = clamp(placement)
  session = clamp(session)
  runtimeCoordination = clamp(runtimeCoordination)
  safety = clamp(safety)
  readability = clamp(readability)

  overall = clamp(
    (dataMapping * 0.15) +
    (planning * 0.15) +
    (placement * 0.15) +
    (session * 0.15) +
    (runtimeCoordination * 0.1) +
    (safety * 0.2) +
    (readability * 0.1)
  )

  let status: ExecutionPreviewQualityScore['status'] = 'excellent'
  if (safety === 0 || consistency.status === 'critical') {
    status = 'unsafe'
  } else if (overall < 30 || dataMapping === 0) {
    status = 'invalid'
  } else if (overall < 50 || dataMapping < 50) {
    status = 'weak'
  } else if (overall < 75) {
    status = 'partial'
  } else if (overall < 95) {
    status = 'usable_with_warnings'
  } else if (overall < 100) {
    status = 'good'
  }

  return {
    overall,
    dataMapping,
    planning,
    placement,
    session,
    runtimeCoordination,
    safety,
    readability,
    status,
    reasons
  }
}
