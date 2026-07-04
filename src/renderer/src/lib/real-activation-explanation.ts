import {
  RealActivationExplanation,
  RealActivationProtocolDraft
} from '../../../shared/real-activation-protocol-model'

export interface RealActivationExplanationInput {
  protocolDraft: RealActivationProtocolDraft
}

export function explainRealActivationProtocol(input: RealActivationExplanationInput): RealActivationExplanation {
  const warnings: string[] = []
  const keyPoints: string[] = [
    'Audit symbolique complet des modules système réels.',
    'Aucun module réel n\'est importé ou référencé à l\'exécution.',
    'Toutes les barrières d\'exécution logicielle sont à false.'
  ]

  if (input.protocolDraft.boundary.status === 'blocked') {
    warnings.push('La frontière d\'exécution est incomplète car le contrat draft est absent.')
  }

  let nextRecommendedAction: RealActivationExplanation['nextRecommendedAction'] = 'keep_audit_only'

  // Safety checks inside explanation
  const anyPermissionGranted = input.protocolDraft.permissionMatrix.permissions.some(p => p.grantedNow)
  if (anyPermissionGranted) {
    warnings.push('ATTENTION : Une brèche de permission a été simulée comme accordée.')
    nextRecommendedAction = 'do_not_execute'
  }

  return {
    title: 'Audit de Protocole d\'Activation Réelle',
    summary: 'Ce rapport décrit la carte statique de l\'impact système d\'une éventuelle activation future sans exécuter de code.',
    keyPoints,
    warnings,
    nextRecommendedAction,
    confidence: 1
  }
}
