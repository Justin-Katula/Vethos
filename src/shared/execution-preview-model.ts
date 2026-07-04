export type ExecutionPreviewMode =
  | 'proposed_only'
  | 'debug_preview'
  | 'ui_preview'
  | 'manual_review_required'
  | 'unsafe'
  | 'low_confidence'

export type ExecutionPreviewStatus =
  | 'ready_for_preview'
  | 'ready_with_warnings'
  | 'partial_preview'
  | 'blocked_by_missing_dependencies'
  | 'blocked_by_invalid_inputs'
  | 'blocked_by_safety'
  | 'manual_review_required'

export type PreviewDependencyStatus =
  | 'available'
  | 'missing'
  | 'invalid'
  | 'stale'
  | 'low_confidence'
  | 'not_required'

export interface PreviewDependencyReport {
  name:
    | 'user_model'
    | 'objective_models'
    | 'task_models'
    | 'priority_scores'
    | 'planning_context'
    | 'placement_plan'
    | 'session_plans'
    | 'runtime_coordinator_plans'
  status: PreviewDependencyStatus
  required: boolean
  reason: string
  confidence: number
}

export interface ExecutionPreviewBlock {
  id: string
  sourcePlacementBlockId?: string
  sourceSessionPlanId?: string
  sourceRuntimeCoordinatorPlanId?: string
  targetType: 'task' | 'objective' | 'strategy_block'
  targetId: string
  title: string
  date: string
  start: string
  end: string
  durationMinutes: number
  previewKind:
    | 'work_block'
    | 'deep_work_block'
    | 'rescue_block'
    | 'review_block'
    | 'recovery_block'
    | 'manual_review_block'
    | 'unplaced_item'
  sessionMode?: string
  protectionMode?: string
  readiness: 'ready' | 'ready_with_warnings' | 'needs_review' | 'blocked' | 'unsafe'
  reasons: string[]
  warnings: string[]
  confidence: number
}

export interface ExecutionPreviewDay {
  date: string
  status:
    | 'healthy'
    | 'tight'
    | 'overloaded'
    | 'fragmented'
    | 'rescue_day'
    | 'manual_review_required'
    | 'no_usable_time'
    | 'unknown'
  blocks: ExecutionPreviewBlock[]
  unplacedCount: number
  summary: {
    proposedWorkMinutes: number
    deepWorkMinutes: number
    rescueMinutes: number
    reviewMinutes: number
    protectedRecoveryMinutes: number
    blockedOrUnsafeCount: number
  }
  reasons: string[]
  warnings: string[]
  confidence: number
}

export interface PreviewPipelineStep {
  id: string
  name:
    | 'input_adaptation'
    | 'dependency_resolution'
    | 'planning_context'
    | 'placement'
    | 'session_planning'
    | 'runtime_coordination'
    | 'readiness_gate'
    | 'safety_check'
    | 'diagnostics'
    | 'explanation'
  status: 'success' | 'success_with_warnings' | 'skipped' | 'failed' | 'manual_review_required'
  reason: string
  warnings: string[]
  durationMs?: number
  confidence: number
}

export interface PreviewPipelineTrace {
  steps: PreviewPipelineStep[]
  failedStepIds: string[]
  warningStepIds: string[]
  confidence: number
}

export interface PreviewReadinessGateResult {
  canDisplayPreview: boolean
  canApplyLater: boolean
  readiness:
    | 'ready_for_debug_preview'
    | 'ready_for_ui_preview'
    | 'partial_preview_only'
    | 'manual_review_required'
    | 'blocked'
    | 'unsafe'
  blockers: string[]
  warnings: string[]
  requiredActions: Array<
    | 'complete_missing_task_models'
    | 'complete_missing_objective_models'
    | 'rebuild_planning_context'
    | 'rebuild_placement_plan'
    | 'rebuild_session_plans'
    | 'review_runtime_coordination'
    | 'manual_review'
    | 'fix_invalid_dates'
    | 'clarify_tasks'
  >
  confidence: number
}

export interface PreviewSafetyReport {
  status: 'safe' | 'warning' | 'unsafe' | 'critical'
  realActionDetected: boolean
  forbiddenDependencyDetected: boolean
  unsafeRuntimePlans: string[]
  warnings: string[]
  reasons: string[]
  confidence: number
}

export interface ExecutionPreviewExplanation {
  title: string
  summary: string
  keyDecisions: string[]
  warnings: string[]
  nextRecommendedAction:
    | 'show_debug_preview'
    | 'show_ui_preview'
    | 'ask_manual_review'
    | 'fix_inputs_first'
    | 'do_not_apply'
  confidence: number
}

export interface ExecutionPreviewDiagnostics {
  status: 'healthy' | 'warning' | 'critical'
  issues: Array<{
    id: string
    severity: 'low' | 'medium' | 'high' | 'critical'
    message: string
    targetId?: string
    suggestion?: string
  }>
  summary: string[]
}

export interface ExecutionPreviewPlanV2 {
  id: string
  userId: string
  dateRange: {
    startDate: string
    endDate: string
  }
  mode: ExecutionPreviewMode
  status: ExecutionPreviewStatus
  dependencies: PreviewDependencyReport[]
  days: ExecutionPreviewDay[]
  placementPlanId?: string
  sessionPlanIds: string[]
  runtimeCoordinatorPlanIds: string[]
  readiness: PreviewReadinessGateResult
  safety: PreviewSafetyReport
  pipelineTrace: PreviewPipelineTrace
  explanation: ExecutionPreviewExplanation
  diagnostics?: ExecutionPreviewDiagnostics
  summary: {
    totalPreviewBlocks: number
    totalProposedMinutes: number
    totalWarnings: number
    totalBlocked: number
    totalManualReview: number
    totalUnsafe: number
  }
  confidence: number
  metadata: {
    modelVersion: number
    createdAt: string
    updatedAt: string
    source: 'execution_preview'
  }
}
