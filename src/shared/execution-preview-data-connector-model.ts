import type { ExecutionPreviewPlanV2 } from './execution-preview-model'

export type ExecutionPreviewDataConnectorMode =
  | 'read_only'
  | 'manual_proposed_build'
  | 'auto_build_disabled'
  | 'unsafe'
  | 'manual_review_required'

export type ExecutionPreviewDataSourceKind =
  | 'task_store'
  | 'objective_store'
  | 'planning_store'
  | 'session_store'
  | 'app_site_store'
  | 'settings_store'
  | 'auth_context'
  | 'unknown'

export type ExecutionPreviewDataSourceReport = {
  kind: ExecutionPreviewDataSourceKind
  name: string
  status:
    | 'available'
    | 'missing'
    | 'partial'
    | 'unsafe'
    | 'read_only_confirmed'
    | 'manual_review_required'
  path?: string
  readableFields: string[]
  forbiddenActions: string[]
  warnings: string[]
  confidence: number
}

export type ExecutionPreviewQaInputSummary = {
  sourceCounts: {
    tasks: number
    objectives: number
    schedules: number
    sessions: number
    apps: number
    sites: number
  }
  sanitizedCounts: {
    tasks: number
    objectives: number
    schedules: number
    sessions: number
    apps: number
    sites: number
  }
  dataWarnings: string[]
  pipelineWarnings: string[]
  pipelineErrors: string[]
  pipelineMode?: string
  providerStatus?: string
  capturedAt?: string
  sanitizedAt?: string
  confidence: number
}

export type ExecutionPreviewRawSnapshot = {
  userId?: string
  tasks: unknown[]
  objectives: unknown[]
  schedules: unknown[]
  sessions: unknown[]
  apps: unknown[]
  sites: unknown[]
  settings?: unknown
  auth?: unknown
  userModel?: unknown
  sourceReports: ExecutionPreviewDataSourceReport[]
  capturedAt: string
  warnings: string[]
  confidence: number
}

export type ExecutionPreviewSanitizedSnapshot = {
  userId: string
  tasks: unknown[]
  objectives: unknown[]
  schedules: unknown[]
  sessions: unknown[]
  apps: unknown[]
  sites: unknown[]
  settings?: unknown
  userModel?: unknown
  dateRange: {
    startDate: string
    endDate: string
  }
  warnings: string[]
  confidence: number
  metadata: {
    source: 'read_only_store_snapshot'
    capturedAt: string
    sanitizedAt: string
  }
}

export type ProposedPipelineBuildMode =
  | 'preview_only'
  | 'partial_preview'
  | 'manual_review_required'
  | 'unsafe'

export type ExecutionPreviewDataConnectorDiagnostics = {
  status: 'healthy' | 'warning' | 'critical'
  issues: Array<{
    id: string
    severity: 'low' | 'medium' | 'high' | 'critical'
    message: string
    suggestion?: string
  }>
  summary: string[]
}

export type ProposedPipelineBuildResult = {
  mode: ProposedPipelineBuildMode
  previewPlan?: ExecutionPreviewPlanV2
  userModel?: unknown
  objectiveModelsV2?: unknown[]
  taskModelsV2?: unknown[]
  priorityScoresV2?: unknown[]
  planningContextV2?: unknown
  placementPlanV2?: unknown
  sessionPlansV2?: unknown[]
  runtimeCoordinatorPlansV2?: unknown[]
  warnings: string[]
  errors: string[]
  diagnostics?: ExecutionPreviewDataConnectorDiagnostics
  confidence: number
  canApplyPreview: false
}

export type ExecutionPreviewProviderState = {
  status:
    | 'idle'
    | 'building'
    | 'ready'
    | 'ready_with_warnings'
    | 'partial'
    | 'failed'
    | 'unsafe'
  previewPlan?: ExecutionPreviewPlanV2
  lastBuildAt?: string
  warnings: string[]
  errors: string[]
  canGeneratePreview: boolean
  canApplyPreview: false
  qaInputSummary?: ExecutionPreviewQaInputSummary
  diagnostics?: ExecutionPreviewDataConnectorDiagnostics
  confidence: number
}
