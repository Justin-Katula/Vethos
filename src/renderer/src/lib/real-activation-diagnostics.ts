import {
  RealActivationDiagnostics,
  RealActivationProtocolDraft,
  RealActivationSeverity
} from '../../../shared/real-activation-protocol-model'

export interface RealActivationDiagnosticsInput {
  protocolDraft: RealActivationProtocolDraft
}

export function runRealActivationDiagnostics(input: RealActivationDiagnosticsInput): RealActivationDiagnostics {
  const issues: RealActivationDiagnostics['issues'] = []
  const summary: string[] = []

  // Diagnose: Audit Only Enforcement
  summary.push('Diagnostics en mode audit uniquement.')

  // Diagnose boundary status
  if (input.protocolDraft.boundary.status === 'blocked') {
    issues.push({
      id: 'diag-boundary-blocked',
      severity: 'high',
      message: 'La frontière minimale d\'exécution est bloquée (contrat manquant).',
      suggestion: 'Veuillez vérifier que l\'activation contractuelle du Point 15 est rédigée.'
    })
  }

  // Diagnose all permissions are false (this is healthy for Point 16, but we document it)
  const allFalse = input.protocolDraft.permissionMatrix.permissions.every(p => !p.grantedNow && !p.canRequestNow)
  if (!allFalse) {
    issues.push({
      id: 'diag-permission-breach',
      severity: 'critical',
      message: 'Violation critique : Une ou plusieurs permissions de l\'audit sont actives ou demandables.',
      suggestion: 'Corrigez immédiatement les drapeaux de permission de l\'UI.'
    })
  }

  // Diagnose candidates
  const count = input.protocolDraft.boundary.futureBoundaryCandidates.length
  summary.push(`${count} points d'entrée d'exécution future détectés.`)

  // Check if any candidate has canExecuteNow: true
  const invalidExecute = input.protocolDraft.boundary.futureBoundaryCandidates.some(c => c.canExecuteNow)
  if (invalidExecute) {
    issues.push({
      id: 'diag-candidate-execution',
      severity: 'critical',
      message: 'Violation critique : Un candidat futur prétend pouvoir s\'exécuter dans le Point 16.',
      suggestion: 'Forcez canExecuteNow à false pour tous les candidats.'
    })
  }

  let status: RealActivationDiagnostics['status'] = 'healthy'
  if (issues.some(i => i.severity === 'critical')) {
    status = 'critical'
  } else if (issues.length > 0) {
    status = 'warning'
  }

  return {
    status,
    issues,
    summary
  }
}
