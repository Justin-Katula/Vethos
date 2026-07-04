import {
  RealActivationProtocolDraft,
  RealExecutableModuleAudit,
  MinimalExecutionBoundaryV2,
  RealActivationPermissionMatrix,
  RealActivationRiskReport,
  RealActivationProtocolStatus
} from '../../../shared/real-activation-protocol-model'

export interface RealActivationProtocolDraftBuilderInput {
  activationBridgeDraftId?: string
  contractDraftId?: string
  moduleAudit: RealExecutableModuleAudit[]
  boundary: MinimalExecutionBoundaryV2
  permissionMatrix: RealActivationPermissionMatrix
  riskReport: RealActivationRiskReport
}

export function buildRealActivationProtocolDraft(input: RealActivationProtocolDraftBuilderInput): RealActivationProtocolDraft {
  const blockers: string[] = []
  const warnings: string[] = []

  // Collect blockers and warnings from boundary, permissionMatrix and riskReport
  if (input.boundary.blockers.length > 0) {
    blockers.push(...input.boundary.blockers)
  }
  if (input.boundary.warnings.length > 0) {
    warnings.push(...input.boundary.warnings)
  }

  // Deduplicate and aggregate
  let status: RealActivationProtocolStatus = 'audit_only'

  if (blockers.length > 0) {
    status = 'blocked_by_missing_boundary'
  } else if (input.permissionMatrix.status === 'blocked') {
    status = 'blocked_by_permissions'
  } else if (input.riskReport.status === 'critical') {
    status = 'blocked_by_safety'
  }

  return {
    id: `draft-protocol-${Date.now()}`,
    activationBridgeDraftId: input.activationBridgeDraftId,
    contractDraftId: input.contractDraftId,
    status,
    moduleAudit: input.moduleAudit,
    boundary: input.boundary,
    permissionMatrix: input.permissionMatrix,
    riskReport: input.riskReport,

    // ALL MUST BE FALSE
    canCallRealManagersNow: false,
    canWriteStoresNow: false,
    canCreateSessionsNow: false,
    canStartSessionsNow: false,
    canApplyPlanningNow: false,
    canEnableBlockingNow: false,
    canCompleteTasksNow: false,
    canTouchOsNow: false,
    canPersistProtocolNow: false,
    canProceedToRealExecution: false,

    blockers,
    warnings,
    metadata: {
      source: 'real_activation_protocol_audit',
      createdAt: new Date().toISOString(),
      modelVersion: 1
    },
    confidence: 1
  }
}
