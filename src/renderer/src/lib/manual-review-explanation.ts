import { ManualReviewDraftV2, ManualReviewGateResult, ManualReviewDiagnostics, ManualReviewExplanation } from '../../../shared/manual-review-gate-model'

export interface ManualReviewExplanationInput {
  draft?: ManualReviewDraftV2
  gateResult?: ManualReviewGateResult
  diagnostics?: ManualReviewDiagnostics
  qaReport?: any
}

export function explainManualReviewGate(input: ManualReviewExplanationInput): ManualReviewExplanation {
  const { draft, gateResult, diagnostics } = input

  let title = 'Review locale'
  let summary = 'Aucune décision.'
  const keyPoints: string[] = []
  const warnings: string[] = []
  let nextRecommendedAction: ManualReviewExplanation['nextRecommendedAction'] = 'continue_review'

  if (diagnostics?.status === 'critical' || gateResult?.status === 'safety_blocked') {
    title = 'Erreur critique'
    summary = 'La review est bloquée car des problèmes critiques de sécurité ont été détectés.'
    keyPoints.push('Veuillez vérifier les logs.')
    nextRecommendedAction = 'do_not_apply'
  } else if (!draft) {
    summary = 'En attente de plan.'
    nextRecommendedAction = 'do_not_apply'
  } else if (draft.status === 'not_started' || draft.status === 'in_review') {
    title = 'Examen du plan'
    summary = 'Ce plan est une prévisualisation. Vérifiez si cela correspond à vos attentes.'
    keyPoints.push('Aucune session réelle ne sera créée depuis cet écran.')
    nextRecommendedAction = 'continue_review'
  } else if (draft.status === 'approved_in_principle') {
    title = 'Plan approuvé en principe'
    summary = 'Vous avez indiqué que ce plan est acceptable.'
    keyPoints.push('Cette approbation locale n\'applique pas le planning.')
    keyPoints.push('Aucune session n\'a été créée.')
    nextRecommendedAction = 'continue_review'
  } else if (draft.status === 'rejected') {
    title = 'Plan rejeté'
    summary = 'Vous avez refusé cette prévisualisation.'
    keyPoints.push('Rien ne sera appliqué.')
    nextRecommendedAction = 'reject_preview'
  } else if (draft.status === 'changes_requested') {
    title = 'Changements demandés'
    summary = 'Vous avez demandé des ajustements sur ce plan.'
    keyPoints.push('Cette version ne sera pas activée.')
    nextRecommendedAction = 'request_changes'
  } else if (draft.status === 'needs_clarification') {
    title = 'Clarification requise'
    summary = 'Vous avez demandé des précisions sur ce plan.'
    nextRecommendedAction = 'continue_review'
  }

  if (gateResult?.status === 'review_blocked') {
    warnings.push('La review est temporairement bloquée (données incomplètes).')
    nextRecommendedAction = 'do_not_apply'
  }

  if (diagnostics?.issues) {
    for (const issue of diagnostics.issues.filter(i => i.severity === 'medium' || i.severity === 'high')) {
      warnings.push(`Diagnostic: ${issue.message}`)
    }
  }

  return {
    title,
    summary,
    keyPoints,
    warnings,
    nextRecommendedAction,
    confidence: draft ? draft.confidence : 0
  }
}
