import { ActivationBridgeGateResult, ExecutionContractDraftV2, ActivationBridgeStatus } from '../../../shared/activation-bridge-model'
import { ExecutionPreviewPlanV2 } from '../../../shared/execution-preview-model'
import { ExecutionPreviewQaReport } from '../../../shared/execution-preview-qa-model'
import { ManualReviewDraftV2, ManualReviewGateResult } from '../../../shared/manual-review-gate-model'
import { runActivationBridgeSafetyCheck } from './activation-bridge-safety-engine'

export interface ActivationBridgeGateInput {
  contractDraft?: ExecutionContractDraftV2
  previewPlan?: ExecutionPreviewPlanV2
  qaReport?: ExecutionPreviewQaReport
  manualReviewDraft?: ManualReviewDraftV2
  manualReviewGateResult?: ManualReviewGateResult
}

export function runActivationBridgeGate(input: ActivationBridgeGateInput): ActivationBridgeGateResult {
  const safety = runActivationBridgeSafetyCheck(input)
  const blockers: string[] = []
  const warnings: string[] = []
  let nextRecommendedAction: ActivationBridgeGateResult['nextRecommendedAction'] = 'do_not_activate'
  let status: ActivationBridgeStatus = 'invalid'

  if (!input.contractDraft) {
    status = 'blocked_by_missing_contract'
    blockers.push('Aucun contrat d\'exécution fourni à la Gate.')
  } else if (safety.status === 'critical' || safety.status === 'blocked') {
    status = 'unsafe'
    blockers.push('Le moteur de sécurité a bloqué l\'analyse du pont d\'activation.')
  } else if (!input.manualReviewDraft || input.manualReviewDraft.previewDecision !== 'accepted_in_principle') {
    status = 'blocked_by_review'
    blockers.push('La prévisualisation n\'a pas encore été approuvée en principe.')
    nextRecommendedAction = 'fix_review_first'
  } else if (input.qaReport && (input.qaReport.status === 'invalid' || input.qaReport.status === 'unsafe')) {
    status = 'blocked_by_qa'
    blockers.push('La qualité du plan est insuffisante ou dangereuse.')
    nextRecommendedAction = 'fix_qa_first'
  } else if (input.previewPlan && (input.previewPlan.safety.status === 'critical' || input.previewPlan.safety.status === 'unsafe')) {
    status = 'blocked_by_preview_safety'
    blockers.push('Le plan initial a échoué aux tests de sécurité.')
    nextRecommendedAction = 'fix_preview_first'
  } else if (input.contractDraft.status === 'blocked' || input.contractDraft.status === 'invalid' || input.contractDraft.status === 'unsafe') {
    status = input.contractDraft.status === 'unsafe' ? 'unsafe' : 'invalid'
    blockers.push('Le contrat brouillon lui-même est bloqué ou invalide.')
    nextRecommendedAction = 'fix_review_first'
  } else {
    // All green!
    status = input.contractDraft.status === 'draft_with_warnings' ? 'draft_ready_with_warnings' : 'draft_ready'
    nextRecommendedAction = 'keep_as_draft' // Because activation is NOT allowed in Point 15.
  }

  // Double down on NO EXECUTION ever.
  return {
    status,
    contractDraft: input.contractDraft,
    safety,
    canProceedToRealActivation: false,
    canApplyAnythingNow: false,
    blockers,
    warnings,
    nextRecommendedAction,
    confidence: 1
  }
}
