import { MinimalExecutionBoundaryV2, RealExecutableModuleAudit } from '../../../shared/real-activation-protocol-model'

export interface MinimalExecutionBoundaryInput {
  moduleAudit: RealExecutableModuleAudit[]
  activationBridgeDraft?: unknown
  contractDraft?: unknown
}

export function buildMinimalExecutionBoundary(input: MinimalExecutionBoundaryInput): MinimalExecutionBoundaryV2 {
  const boundary: MinimalExecutionBoundaryV2 = {
    id: `boundary-${Date.now()}`,
    status: 'defined_for_audit_only',
    allowedNow: {
      readContract: true,
      showProtocolDraft: true,
      showRisks: true,
      showPermissions: true,
      callRealManagers: false,
      writeStores: false,
      writeLocalStorage: false,
      createSessions: false,
      startSessions: false,
      applyPlanning: false,
      enableBlocking: false,
      completeTasks: false,
      touchOs: false
    },
    futureBoundaryCandidates: [],
    blockers: [],
    warnings: [],
    confidence: 1
  }

  if (!input.contractDraft) {
    boundary.status = 'blocked'
    boundary.blockers.push('Contract draft is missing.')
    return boundary
  }

  for (const module of input.moduleAudit) {
    for (const fn of module.realFunctions) {
      if (fn.candidateForFuturePoint) {
        boundary.futureBoundaryCandidates.push({
          id: `cand-${module.id}-${fn.name}`,
          name: `${module.name}::${fn.name}`,
          targetModuleKind: module.kind,
          targetFunctionName: fn.name,
          futurePointEarliest: 17, // Explicitly proposed to be >= 17 as requested
          requiredFlags: ['realActivationControlsRealManagers', 'realActivationControlsOsAccess'],
          requiredPreconditions: fn.requiredPreconditions,
          riskLevel: fn.dangerLevel,
          canExecuteNow: false
        })
      }
    }
  }

  return boundary
}
