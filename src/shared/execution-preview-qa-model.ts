export type ExecutionPreviewQaStatus =
  | 'excellent'
  | 'good'
  | 'usable_with_warnings'
  | 'partial'
  | 'weak'
  | 'unsafe'
  | 'invalid'

export type ExecutionPreviewQaSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical'

export type ExecutionPreviewQaCheckCategory =
  | 'data_mapping'
  | 'planning'
  | 'placement'
  | 'session'
  | 'runtime_coordination'
  | 'safety'
  | 'readiness'
  | 'ui'
  | 'diagnostics'
  | 'hardcode'
  | 'serialization'

export type ExecutionPreviewQaCheck = {
  id: string
  category: ExecutionPreviewQaCheckCategory
  status: 'pass' | 'warning' | 'fail' | 'skipped' | 'manual_review_required'
  severity: ExecutionPreviewQaSeverity
  title: string
  message: string
  targetId?: string
  expected?: string
  actual?: string
  suggestion?: string
  confidence: number
}

export type ExecutionPreviewMappingAudit = {
  status: 'healthy' | 'partial' | 'weak' | 'invalid'
  tasks: {
    sourceCount: number
    mappedCount: number
    ignoredCount: number
    invalidCount: number
    warnings: string[]
  }
  objectives: {
    sourceCount: number
    mappedCount: number
    ignoredCount: number
    invalidCount: number
    warnings: string[]
  }
  planning: {
    hasScheduleData: boolean
    hasUsableTimeWindows: boolean
    fixedBlocksCount: number
    warnings: string[]
  }
  appsAndSites: {
    sourceAppsCount: number
    sourceSitesCount: number
    mappedRestrictionsCount: number
    warnings: string[]
  }
  confidence: number
}

export type ExecutionPreviewConsistencyReport = {
  status: 'consistent' | 'warning' | 'inconsistent' | 'critical'
  checks: ExecutionPreviewQaCheck[]
  summary: string[]
  confidence: number
}

export type ExecutionPreviewCalibrationReport = {
  status:
    | 'calibrated'
    | 'needs_minor_adjustment'
    | 'needs_major_adjustment'
    | 'not_enough_data'
    | 'unsafe'
  findings: ExecutionPreviewQaCheck[]
  recommendations: Array<{
    id: string
    priority: 'low' | 'medium' | 'high' | 'critical'
    title: string
    description: string
    nextAction:
      | 'adjust_mapping'
      | 'improve_input_data'
      | 'improve_shadow_builder'
      | 'manual_review'
      | 'do_not_activate'
  }>
  confidence: number
}

export type ExecutionPreviewQualityScore = {
  overall: number
  dataMapping: number
  planning: number
  placement: number
  session: number
  runtimeCoordination: number
  safety: number
  readability: number
  status: ExecutionPreviewQaStatus
  reasons: string[]
}

export type ExecutionPreviewQaDiagnostics = {
  status: 'healthy' | 'warning' | 'critical'
  issues: Array<{
    id: string
    severity: ExecutionPreviewQaSeverity
    message: string
    suggestion?: string
  }>
  summary: string[]
}

export type ExecutionPreviewQaReport = {
  id: string
  previewPlanId?: string
  status: ExecutionPreviewQaStatus
  qualityScore: ExecutionPreviewQualityScore
  mappingAudit: ExecutionPreviewMappingAudit
  consistency: ExecutionPreviewConsistencyReport
  calibration: ExecutionPreviewCalibrationReport
  diagnostics: ExecutionPreviewQaDiagnostics
  checks: ExecutionPreviewQaCheck[]
  canProceedToActivationPlanning: boolean
  warnings: string[]
  blockers: string[]
  explanation: {
    title: string
    summary: string
    keyFindings: string[]
    nextRecommendedAction:
      | 'keep_debug_only'
      | 'fix_data_mapping'
      | 'fix_preview_pipeline'
      | 'collect_more_real_data'
      | 'manual_review'
      | 'do_not_activate'
  }
  confidence: number
  metadata: {
    source: 'execution_preview_qa'
    createdAt: string
    modelVersion: number
  }
}
