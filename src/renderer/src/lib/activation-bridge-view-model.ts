import { ActivationBridgeDraftV2, ExecutionContractDraftV2, ActivationBridgeGateResult, ActivationBridgeDiagnostics, ActivationBridgeExplanation } from '../../../shared/activation-bridge-model'

export interface ActivationBridgeViewModelInput {
  bridgeDraft?: ActivationBridgeDraftV2
  contractDraft?: ExecutionContractDraftV2
  gateResult?: ActivationBridgeGateResult
  diagnostics?: ActivationBridgeDiagnostics
  explanation?: ActivationBridgeExplanation
}

export interface ActivationBridgeViewModel {
  title: string
  statusLabel: string
  statusSeverity: 'neutral' | 'good' | 'warning' | 'critical'
  
  summaryCards: Array<{
    label: string
    value: string
    severity: 'neutral' | 'good' | 'warning' | 'critical'
  }>
  
  futureActionRows: Array<{
    id: string
    label: string
    statusLabel: string
    reason: string
    canExecuteNow: false
  }>
  
  preconditionRows: Array<{
    id: string
    label: string
    statusLabel: string
    reason: string
    severity: 'neutral' | 'good' | 'warning' | 'critical'
  }>
  
  warnings: string[]
  blockers: string[]
  
  canProceedToRealActivation: false
  canApplyAnythingNow: false
  
  forbiddenActionNotice: string
}

export function buildActivationBridgeViewModel(input: ActivationBridgeViewModelInput): ActivationBridgeViewModel {
  const { contractDraft, gateResult, explanation } = input

  const vm: ActivationBridgeViewModel = {
    title: explanation?.title || 'Contrat Théorique d\'Activation',
    statusLabel: 'Draft',
    statusSeverity: 'neutral',
    summaryCards: [],
    futureActionRows: [],
    preconditionRows: [],
    warnings: gateResult?.warnings || [],
    blockers: gateResult?.blockers || [],
    canProceedToRealActivation: false,
    canApplyAnythingNow: false,
    forbiddenActionNotice: 'Activation réelle interdite. Ce contrat est uniquement descriptif des actions futures possibles.'
  }

  if (!contractDraft || !gateResult) {
    vm.statusLabel = 'Non défini'
    vm.statusSeverity = 'critical'
    return vm
  }

  switch (gateResult.status) {
    case 'draft_ready':
      vm.statusLabel = 'Prêt (Brouillon uniquement)'
      vm.statusSeverity = 'good'
      break
    case 'draft_ready_with_warnings':
      vm.statusLabel = 'Prêt avec Avertissements'
      vm.statusSeverity = 'warning'
      break
    case 'blocked_by_qa':
    case 'blocked_by_review':
    case 'blocked_by_missing_contract':
    case 'blocked_by_preview_safety':
      vm.statusLabel = 'Action future bloquée'
      vm.statusSeverity = 'warning'
      break
    case 'unsafe':
    case 'invalid':
    default:
      vm.statusLabel = 'Interdit / Non sûr'
      vm.statusSeverity = 'critical'
      break
  }

  vm.summaryCards.push({
    label: 'Statut du Contrat',
    value: vm.statusLabel,
    severity: vm.statusSeverity
  })

  vm.summaryCards.push({
    label: 'Approbation en principe',
    value: contractDraft.approvedInPrinciple ? 'Oui' : 'Non',
    severity: contractDraft.approvedInPrinciple ? 'good' : 'warning'
  })

  for (const action of contractDraft.futureActions) {
    vm.futureActionRows.push({
      id: action.id,
      label: action.label,
      statusLabel: action.status === 'blocked' ? 'Bloqué' : action.status === 'requires_future_permission' ? 'Permission requise' : 'En attente',
      reason: action.reason,
      canExecuteNow: false
    })
  }

  if (contractDraft.preconditions) {
    for (const pre of contractDraft.preconditions.items) {
      vm.preconditionRows.push({
        id: pre.id,
        label: pre.label,
        statusLabel: pre.status === 'passed' ? 'Validé' : pre.status === 'failed' ? 'Échec' : pre.status === 'warning' ? 'Attention' : 'Bloqué',
        reason: pre.reason,
        severity: pre.status === 'passed' ? 'good' : pre.status === 'failed' ? 'critical' : pre.status === 'warning' ? 'warning' : 'critical'
      })
    }
  }

  return vm
}
