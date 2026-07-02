import { RealActivationProtocolReport, RealActivationProtocolDraft } from '../../../shared/real-activation-protocol-model'
import { runRealActivationReadiness } from './real-activation-readiness-engine'
import { runRealActivationDiagnostics } from './real-activation-diagnostics'
import { explainRealActivationProtocol } from './real-activation-explanation'

export interface RealActivationViewModelInput {
  protocolDraft: RealActivationProtocolDraft
  now?: string
}

export function buildRealActivationViewModel(input: RealActivationViewModelInput): RealActivationProtocolReport {
  const readiness = runRealActivationReadiness({ protocolDraft: input.protocolDraft })
  const diagnostics = runRealActivationDiagnostics({ protocolDraft: input.protocolDraft })
  const explanation = explainRealActivationProtocol({ protocolDraft: input.protocolDraft })

  return {
    id: `report-${Date.now()}`,
    status: input.protocolDraft.status,
    protocolDraft: input.protocolDraft,
    readiness,
    diagnostics,
    explanation,

    canProceedToRealExecution: false,
    canCallRealManagersNow: false,

    createdAt: input.now || new Date().toISOString(),
    confidence: 1
  }
}
