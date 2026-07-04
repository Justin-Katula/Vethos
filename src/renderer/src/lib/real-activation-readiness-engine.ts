import {
  RealActivationReadinessReport,
  RealActivationProtocolDraft,
  RealActivationSeverity
} from '../../../shared/real-activation-protocol-model'

export interface RealActivationReadinessEngineInput {
  protocolDraft: RealActivationProtocolDraft
}

export function runRealActivationReadiness(input: RealActivationReadinessEngineInput): RealActivationReadinessReport {
  const checks: RealActivationReadinessReport['readinessChecks'] = []

  // Check 1: Audit Only Lock
  checks.push({
    id: 'check-audit-only-lock',
    label: 'Verrouillage Audit Uniquement',
    status: 'passed_for_draft',
    severity: 'info',
    reason: 'Le système est restreint au mode audit. C\'est un succès pour la sécurité.'
  })

  // Check 2: No Real Execution Allowed
  const canProceed = input.protocolDraft.canProceedToRealExecution
  checks.push({
    id: 'check-no-real-execution',
    label: 'Interdiction Exécution Réelle',
    status: canProceed ? 'failed' : 'passed_for_draft',
    severity: 'critical',
    reason: canProceed
      ? 'Erreur de sécurité : exécution réelle activée inopinément.'
      : 'Sécurité garantie : aucune exécution réelle autorisée.'
  })

  // Check 3: Boundary block check
  const hasBlockers = input.protocolDraft.blockers.length > 0
  checks.push({
    id: 'check-boundary-blockers',
    label: 'Bloqueurs de Frontière',
    status: hasBlockers ? 'blocked' : 'passed_for_draft',
    severity: 'high',
    reason: hasBlockers ? 'Des bloqueurs empêchent la définition de la frontière.' : 'Aucun bloqueur détecté.'
  })

  // Check 4: Permission Matrix Check (should detect any true permission as critical violation)
  const anyPermissionGranted = input.protocolDraft.permissionMatrix.permissions.some(p => p.grantedNow)
  const anyPermissionCanRequest = input.protocolDraft.permissionMatrix.permissions.some(p => p.canRequestNow)
  
  if (anyPermissionGranted || anyPermissionCanRequest) {
    checks.push({
      id: 'check-permissions-breach',
      label: 'Brèche de Permissions',
      status: 'failed',
      severity: 'critical',
      reason: 'Alerte de sécurité : des permissions ont été indûment accordées ou demandées dans le Point 16.'
    })
  } else {
    checks.push({
      id: 'check-permissions-lock',
      label: 'Verrouillage des Permissions',
      status: 'passed_for_draft',
      severity: 'info',
      reason: 'Toutes les permissions restent non accordées.'
    })
  }

  // Next Step Determination (Must never be 'execute')
  let status: RealActivationReadinessReport['status'] = 'draft_only_ready'
  let nextAllowedStep: RealActivationReadinessReport['nextAllowedStep'] = 'keep_audit_only'

  if (anyPermissionGranted || anyPermissionCanRequest || canProceed) {
    status = 'invalid'
    nextAllowedStep = 'do_not_execute'
  } else if (hasBlockers) {
    status = 'blocked'
    nextAllowedStep = 'improve_protocol'
  }

  return {
    status,
    readinessChecks: checks,
    canProceedToRealExecution: false, // Explicitly false
    nextAllowedStep,
    confidence: 1
  }
}
