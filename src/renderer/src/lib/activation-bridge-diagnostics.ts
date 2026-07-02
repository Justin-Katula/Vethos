import { ActivationBridgeDiagnostics, ActivationBridgeGateResult, ExecutionContractDraftV2, ActivationBridgeDraftV2 } from '../../../shared/activation-bridge-model'
import { ExecutionPreviewPlanV2 } from '../../../shared/execution-preview-model'
import { ExecutionPreviewQaReport } from '../../../shared/execution-preview-qa-model'
import { ManualReviewDraftV2 } from '../../../shared/manual-review-gate-model'

export interface ActivationBridgeDiagnosticsInput {
  bridgeDraft?: ActivationBridgeDraftV2
  contractDraft?: ExecutionContractDraftV2
  gateResult?: ActivationBridgeGateResult
  previewPlan?: ExecutionPreviewPlanV2
  qaReport?: ExecutionPreviewQaReport
  manualReviewDraft?: ManualReviewDraftV2
}

export function runActivationBridgeDiagnostics(input: ActivationBridgeDiagnosticsInput): ActivationBridgeDiagnostics {
  const diagnostics: ActivationBridgeDiagnostics = {
    status: 'healthy',
    issues: [],
    summary: []
  }

  const addIssue = (severity: 'medium' | 'critical', message: string) => {
    if (severity === 'critical') diagnostics.status = 'critical'
    else if (diagnostics.status === 'healthy') diagnostics.status = 'warning'
    
    diagnostics.issues.push({
      id: `diag-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      severity,
      message
    })
  }

  if (!input.contractDraft) {
    addIssue('critical', 'Le draft du contrat d\'activation est absent.')
    return diagnostics
  }

  const { contractDraft, gateResult } = input

  if (
    contractDraft.canActivateNow ||
    contractDraft.canApplyPlanningNow ||
    contractDraft.canCreateSessionsNow ||
    contractDraft.canStartSessionsNow ||
    contractDraft.canEnableBlockingNow ||
    contractDraft.canCompleteTasksNow ||
    contractDraft.canPersistContractNow
  ) {
    addIssue('critical', 'Un flag d\'activation globale a été trouvé à TRUE. Violation critique de sécurité.')
  }

  if (gateResult && (gateResult.canProceedToRealActivation || gateResult.canApplyAnythingNow)) {
    addIssue('critical', 'Le GateResult autorise l\'activation réelle. Violation critique de sécurité.')
  }

  const seenActionIds = new Set<string>()
  for (const action of contractDraft.futureActions) {
    if (seenActionIds.has(action.id)) {
      addIssue('medium', `L'action future "${action.id}" est dupliquée.`)
    }
    seenActionIds.add(action.id)

    if (action.canExecuteNow) {
      addIssue('critical', `L'action future "${action.label}" déclare être exécutable immédiatement.`)
    }
  }

  if (contractDraft.approvedInPrinciple && (!input.manualReviewDraft || input.manualReviewDraft.previewDecision !== 'accepted_in_principle')) {
    addIssue('critical', 'Le contrat prétend être approuvé, mais la Manual Review source contredit cette information.')
  }

  if (gateResult) {
    if (gateResult.status === 'draft_ready' && input.qaReport?.status === 'unsafe') {
      addIssue('critical', 'Contradiction : Gate est draft_ready mais QA est unsafe.')
    }
    if (gateResult.blockers.length > 0 && gateResult.warnings.length === 0 && gateResult.status !== 'unsafe' && gateResult.status !== 'invalid') {
      addIssue('medium', 'Des bloqueurs sont présents, mais aucun warning associé n\'a été émis.')
    }
  }

  return diagnostics
}
