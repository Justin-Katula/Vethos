export type RealActivationProtocolStatus =
  | 'audit_only'
  | 'protocol_draft_ready'
  | 'protocol_draft_with_warnings'
  | 'blocked_by_contract'
  | 'blocked_by_permissions'
  | 'blocked_by_safety'
  | 'blocked_by_missing_boundary'
  | 'unsafe'
  | 'invalid'

export type RealActivationSeverity =
  | 'info'
  | 'low'
  | 'medium'
  | 'high'
  | 'critical'

export type RealExecutableModuleKind =
  | 'session_manager'
  | 'task_store'
  | 'planning_store'
  | 'blocking_store'
  | 'settings_store'
  | 'runtime_coordinator'
  | 'process_watcher'
  | 'app_overlay'
  | 'site_overlay'
  | 'hosts_writer'
  | 'firewall'
  | 'strict_block_window'
  | 'media_controls'
  | 'timer'
  | 'closure'
  | 'outcome'
  | 'unknown'

export interface RealExecutableModuleAudit {
  id: string
  kind: RealExecutableModuleKind
  name: string
  path?: string

  realFunctions: Array<{
    name: string
    effect:
      | 'read_only'
      | 'writes_store'
      | 'starts_session'
      | 'stops_session'
      | 'starts_timer'
      | 'writes_hosts'
      | 'writes_firewall'
      | 'opens_overlay'
      | 'attaches_window'
      | 'mutes_media'
      | 'modifies_task'
      | 'modifies_planning'
      | 'unknown'

    dangerLevel: RealActivationSeverity
    canCallInPoint16: false
    canReferenceSymbolically: boolean
    candidateForFuturePoint: boolean
    requiredPreconditions: string[]
    risks: string[]
  }>

  warnings: string[]
  confidence: number
}

export interface MinimalExecutionBoundaryV2 {
  id: string
  status: 'defined_for_audit_only' | 'partial' | 'blocked' | 'unsafe' | 'invalid'

  allowedNow: {
    readContract: true
    showProtocolDraft: true
    showRisks: true
    showPermissions: true
    callRealManagers: false
    writeStores: false
    writeLocalStorage: false
    createSessions: false
    startSessions: false
    applyPlanning: false
    enableBlocking: false
    completeTasks: false
    touchOs: false
  }

  futureBoundaryCandidates: Array<{
    id: string
    name: string
    targetModuleKind: RealExecutableModuleKind
    targetFunctionName?: string
    futurePointEarliest: number
    requiredFlags: string[]
    requiredPreconditions: string[]
    riskLevel: RealActivationSeverity
    canExecuteNow: false
  }>

  blockers: string[]
  warnings: string[]
  confidence: number
}

export interface RealActivationPermissionMatrix {
  status: 'draft_only' | 'warning' | 'blocked' | 'unsafe'

  permissions: Array<{
    id: string
    label: string
    category:
      | 'user_confirmation'
      | 'store_write'
      | 'session'
      | 'blocking'
      | 'os'
      | 'network'
      | 'media'
      | 'task_completion'
      | 'planning'
      | 'persistence'
    requiredForFutureActivation: boolean
    grantedNow: false
    canRequestNow: false
    reason: string
    riskLevel: RealActivationSeverity
  }>

  canActivateNow: false
  confidence: number
}

export interface RealActivationRiskReport {
  status: 'low' | 'warning' | 'high' | 'critical'

  risks: Array<{
    id: string
    severity: RealActivationSeverity
    category:
      | 'data_loss'
      | 'wrong_blocking'
      | 'os_side_effect'
      | 'session_integrity'
      | 'user_lockout'
      | 'privacy'
      | 'performance'
      | 'ui_confusion'
      | 'store_corruption'
      | 'unknown'
    message: string
    mitigationRequired: string
    blocksActivation: boolean
  }>

  canProceedToRealExecution: false
  confidence: number
}

export interface RealActivationProtocolDraft {
  id: string
  activationBridgeDraftId?: string
  contractDraftId?: string

  status: RealActivationProtocolStatus
  moduleAudit: RealExecutableModuleAudit[]
  boundary: MinimalExecutionBoundaryV2
  permissionMatrix: RealActivationPermissionMatrix
  riskReport: RealActivationRiskReport

  canCallRealManagersNow: false
  canWriteStoresNow: false
  canCreateSessionsNow: false
  canStartSessionsNow: false
  canApplyPlanningNow: false
  canEnableBlockingNow: false
  canCompleteTasksNow: false
  canTouchOsNow: false
  canPersistProtocolNow: false
  canProceedToRealExecution: false

  blockers: string[]
  warnings: string[]

  metadata: {
    source: 'real_activation_protocol_audit'
    createdAt: string
    modelVersion: number
  }
  confidence: number
}

export interface RealActivationReadinessReport {
  status: 'not_ready' | 'draft_only_ready' | 'blocked' | 'unsafe' | 'invalid'

  readinessChecks: Array<{
    id: string
    label: string
    status: 'passed_for_draft' | 'warning' | 'failed' | 'blocked' | 'not_checked'
    severity: RealActivationSeverity
    reason: string
  }>

  canProceedToRealExecution: false

  nextAllowedStep:
    | 'keep_audit_only'
    | 'improve_protocol'
    | 'define_real_adapter_contract'
    | 'fix_contract'
    | 'fix_review'
    | 'fix_qa'
    | 'do_not_execute'

  confidence: number
}

export interface RealActivationDiagnostics {
  status: 'healthy' | 'warning' | 'critical'
  issues: Array<{
    id: string
    severity: RealActivationSeverity
    message: string
    suggestion?: string
  }>
  summary: string[]
}

export interface RealActivationExplanation {
  title: string
  summary: string
  keyPoints: string[]
  warnings: string[]

  nextRecommendedAction:
    | 'keep_audit_only'
    | 'define_adapter_contract_later'
    | 'fix_boundaries'
    | 'fix_permissions'
    | 'fix_safety'
    | 'do_not_execute'

  confidence: number
}

export interface RealActivationProtocolReport {
  id: string
  status: RealActivationProtocolStatus

  protocolDraft: RealActivationProtocolDraft
  readiness: RealActivationReadinessReport
  diagnostics: RealActivationDiagnostics
  explanation: RealActivationExplanation

  canProceedToRealExecution: false
  canCallRealManagersNow: false

  createdAt: string
  confidence: number
}
