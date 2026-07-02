import { ActivationBridgeExplanation, ActivationBridgeGateResult, ActivationBridgeDiagnostics, ExecutionContractDraftV2 } from '../../../shared/activation-bridge-model'

export interface ActivationBridgeExplanationInput {
  contractDraft?: ExecutionContractDraftV2
  gateResult?: ActivationBridgeGateResult
  diagnostics?: ActivationBridgeDiagnostics
}

export function explainActivationBridge(input: ActivationBridgeExplanationInput): ActivationBridgeExplanation {
  const { contractDraft, gateResult, diagnostics } = input

  const explanation: ActivationBridgeExplanation = {
    title: 'Contrat Théorique d\'Activation',
    summary: '',
    keyPoints: [],
    warnings: [],
    nextRecommendedAction: 'do_not_activate',
    confidence: 1
  }

  if (!contractDraft || !gateResult) {
    explanation.title = 'Contrat d\'Activation Indisponible'
    explanation.summary = 'Le système n\'a pas pu générer de contrat théorique.'
    return explanation
  }

  // Generate strict, read-only explanation based on status
  switch (gateResult.status) {
    case 'draft_ready':
    case 'draft_ready_with_warnings':
      explanation.summary = 'Le plan est approuvé en principe, mais aucune activation réelle n\'est autorisée à ce stade.'
      explanation.keyPoints.push('Toutes les conditions préalables pour un contrat d\'activation sont remplies.')
      explanation.keyPoints.push('Ce contrat décrit seulement les actions futures possibles, il n\'exécute rien.')
      explanation.nextRecommendedAction = 'keep_as_draft'
      break
    case 'blocked_by_review':
      explanation.title = 'Activation Future Bloquée (Revue Manuelle)'
      explanation.summary = 'L\'activation réelle reste bloquée car la prévisualisation n\'a pas été explicitement approuvée.'
      explanation.keyPoints.push('Vous devez d\'abord approuver le plan en principe dans la section précédente.')
      explanation.nextRecommendedAction = 'fix_review'
      break
    case 'blocked_by_qa':
      explanation.title = 'Activation Future Bloquée (Qualité Insuffisante)'
      explanation.summary = 'L\'activation réelle reste bloquée car les indicateurs de qualité ont échoué.'
      explanation.keyPoints.push('La QA doit être corrigée avant de penser à l\'exécution théorique ou réelle.')
      explanation.nextRecommendedAction = 'fix_qa'
      break
    case 'unsafe':
      explanation.title = 'Activation Future Interdite (Sécurité)'
      explanation.summary = 'Le contrat brouillon a été rejeté par les gardes-fous de sécurité.'
      explanation.keyPoints.push('Une violation de sécurité a été détectée dans les données générées.')
      explanation.nextRecommendedAction = 'do_not_activate'
      break
    default:
      explanation.summary = 'L\'état du contrat est incertain.'
      explanation.nextRecommendedAction = 'do_not_activate'
      break
  }

  explanation.keyPoints.push('L\'exécution automatique et la persistance des sessions sont actuellement désactivées (Mode Read-Only).')

  if (diagnostics && diagnostics.status !== 'healthy') {
    explanation.warnings.push('Des anomalies diagnostiques ont été détectées sur ce contrat.')
  }

  return explanation
}
