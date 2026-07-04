import {
  ExecutionPreviewCalibrationReport,
  ExecutionPreviewConsistencyReport,
  ExecutionPreviewMappingAudit,
  ExecutionPreviewQaDiagnostics,
  ExecutionPreviewQaReport,
  ExecutionPreviewQualityScore
} from '@shared/execution-preview-qa-model'

export type QaDiagnosticsInput = {
  qaReport?: Partial<ExecutionPreviewQaReport>
  mappingAudit?: ExecutionPreviewMappingAudit
  consistency?: ExecutionPreviewConsistencyReport
  calibration?: ExecutionPreviewCalibrationReport
  qualityScore?: ExecutionPreviewQualityScore
}

export function runExecutionPreviewQaDiagnostics(
  input: QaDiagnosticsInput
): ExecutionPreviewQaDiagnostics {
  const { qaReport, mappingAudit, consistency, calibration, qualityScore } = input
  const issues: ExecutionPreviewQaDiagnostics['issues'] = []
  
  if (qaReport?.canProceedToActivationPlanning === true as boolean) {
    issues.push({
      id: 'diag-1',
      severity: 'critical',
      message: 'canProceedToActivationPlanning is true in QA Report. This is strictly forbidden.',
      suggestion: 'Ensure canProceedToActivationPlanning is hardcoded to false.'
    })
  }

  if (qualityScore) {
    const scores = [
      qualityScore.overall,
      qualityScore.dataMapping,
      qualityScore.planning,
      qualityScore.placement,
      qualityScore.session,
      qualityScore.runtimeCoordination,
      qualityScore.safety,
      qualityScore.readability
    ]
    
    if (scores.some(s => isNaN(s) || !isFinite(s))) {
      issues.push({
        id: 'diag-2',
        severity: 'critical',
        message: 'Quality score contains NaN or Infinity.',
        suggestion: 'Ensure calculations do not divide by zero and handle empty arrays.'
      })
    }

    if (scores.some(s => s < 0 || s > 100)) {
      issues.push({
        id: 'diag-3',
        severity: 'critical',
        message: 'Quality score is out of bounds [0, 100].',
        suggestion: 'Use a clamp function.'
      })
    }

    if (qualityScore.status === 'excellent' && consistency?.status === 'critical') {
      issues.push({
        id: 'diag-4',
        severity: 'critical',
        message: 'Quality score is excellent but consistency is critical.',
        suggestion: 'Cap score status based on consistency.'
      })
    }
  } else {
    issues.push({
      id: 'diag-5',
      severity: 'critical',
      message: 'Quality score is missing.',
    })
  }

  if (mappingAudit?.status === 'invalid' && calibration?.status === 'calibrated') {
    issues.push({
      id: 'diag-6',
      severity: 'high',
      message: 'Mapping is invalid but calibration is calibrated.',
      suggestion: 'Ensure calibration checks mapping status.'
    })
  }

  const checkIds = new Set<string>()
  const allChecks = [
    ...(consistency?.checks ?? []),
    ...(calibration?.findings ?? []),
    ...(qaReport?.checks ?? [])
  ]

  allChecks.forEach(check => {
    if (checkIds.has(check.id)) {
      issues.push({
        id: `diag-7-${check.id}`,
        severity: 'medium',
        message: `Duplicate check ID found: ${check.id}`
      })
    }
    checkIds.add(check.id)
  })

  let status: ExecutionPreviewQaDiagnostics['status'] = 'healthy'
  if (issues.some(i => i.severity === 'critical')) {
    status = 'critical'
  } else if (issues.length > 0) {
    status = 'warning'
  }

  return {
    status,
    issues,
    summary: issues.map(i => i.message)
  }
}
