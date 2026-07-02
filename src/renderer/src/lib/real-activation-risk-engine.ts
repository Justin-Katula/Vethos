import { RealActivationRiskReport, RealExecutableModuleAudit } from '../../../shared/real-activation-protocol-model'

export interface RealActivationRiskEngineInput {
  moduleAudit: RealExecutableModuleAudit[]
  now?: string
}

export function runRealActivationRiskEngine(input: RealActivationRiskEngineInput): RealActivationRiskReport {
  const report: RealActivationRiskReport = {
    status: 'low',
    risks: [],
    canProceedToRealExecution: false,
    confidence: 1
  }

  // Symbolically check the audited modules to generate risks
  for (const module of input.moduleAudit) {
    for (const fn of module.realFunctions) {
      if (fn.dangerLevel === 'critical' || fn.dangerLevel === 'high') {
        report.status = 'critical'
        report.risks.push({
          id: `risk-${module.kind}-${fn.name}`,
          severity: fn.dangerLevel,
          category: fn.effect === 'writes_hosts' || fn.effect === 'writes_firewall' ? 'os_side_effect' : 'session_integrity',
          message: `L'activation réelle de ${module.name}::${fn.name} peut causer des perturbations système ou un blocage irréversible.`,
          mitigationRequired: `Validation manuelle rigoureuse et isolation par bac à sable.`,
          blocksActivation: true
        })
      }
    }
  }

  // Add default structural risks
  report.risks.push({
    id: 'risk-audit-only',
    severity: 'info',
    category: 'ui_confusion',
    message: 'Le système est configuré en mode AUDIT SEULEMENT. Aucune action réelle ne sera entreprise.',
    mitigationRequired: 'Aucune mitigation requise.',
    blocksActivation: false
  })

  return report
}
