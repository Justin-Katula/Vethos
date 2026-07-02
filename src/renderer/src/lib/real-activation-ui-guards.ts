import { RealActivationProtocolReport } from '../../../shared/real-activation-protocol-model'

export function guardRealActivationUi(report: RealActivationProtocolReport): boolean {
  // Check main report flags
  if (
    report.canProceedToRealExecution ||
    report.canCallRealManagersNow ||
    report.protocolDraft.canCallRealManagersNow ||
    report.protocolDraft.canWriteStoresNow ||
    report.protocolDraft.canCreateSessionsNow ||
    report.protocolDraft.canStartSessionsNow ||
    report.protocolDraft.canApplyPlanningNow ||
    report.protocolDraft.canEnableBlockingNow ||
    report.protocolDraft.canCompleteTasksNow ||
    report.protocolDraft.canTouchOsNow ||
    report.protocolDraft.canPersistProtocolNow ||
    report.protocolDraft.canProceedToRealExecution
  ) {
    throw new Error('VIOLATION CRITIQUE DE SÉCURITÉ : Tentative d\'exécution détectée dans l\'état global.')
  }

  // Check allowedNow boundary flags
  const allowed = report.protocolDraft.boundary.allowedNow
  if (
    allowed.callRealManagers ||
    allowed.writeStores ||
    allowed.writeLocalStorage ||
    allowed.createSessions ||
    allowed.startSessions ||
    allowed.applyPlanning ||
    allowed.enableBlocking ||
    allowed.completeTasks ||
    allowed.touchOs
  ) {
    throw new Error('VIOLATION CRITIQUE DE SÉCURITÉ : Barrière d\'autorisation temporaire contournée.')
  }

  // Check future candidates
  for (const candidate of report.protocolDraft.boundary.futureBoundaryCandidates) {
    if (candidate.canExecuteNow) {
      throw new Error(`VIOLATION CRITIQUE DE SÉCURITÉ : Le candidat ${candidate.name} prétend s'exécuter immédiatement.`)
    }
  }

  // Check permissions
  for (const perm of report.protocolDraft.permissionMatrix.permissions) {
    if (perm.grantedNow || perm.canRequestNow) {
      throw new Error(`VIOLATION CRITIQUE DE SÉCURITÉ : Permission ${perm.label} active ou demandable.`)
    }
  }

  // Check module audit functions
  for (const module of report.protocolDraft.moduleAudit) {
    for (const fn of module.realFunctions) {
      if (fn.canCallInPoint16) {
        throw new Error(`VIOLATION CRITIQUE DE SÉCURITÉ : Fonction ${module.name}::${fn.name} marquée comme exécutable.`)
      }
    }
  }

  // All guards passed, strictly audit-only.
  return true
}
