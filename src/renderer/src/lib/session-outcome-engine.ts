import type { CompletionGateResult } from '@shared/completion-gate'
import type { SessionIntegrityResult, SessionOutcomeV2, SessionPlanV2 } from '@shared/session-model'

export interface SessionClosureResponse {
  selectedOutcome?: 'no_progress' | 'partial_progress' | 'confirmed_progress' | 'claimed_completed'
  answerText?: string
  specificityScore?: number
}

export interface SessionOutcomeInput {
  sessionPlan: SessionPlanV2
  integrityResult?: SessionIntegrityResult
  closureResponse?: SessionClosureResponse
  completionGateResult?: CompletionGateResult | { approved: boolean; reason?: string }
  userModel?: unknown
}

function clampScore(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0
}

function gateApproved(result: SessionOutcomeInput['completionGateResult']): boolean {
  if (!result) return false
  return 'approved' in result
    ? result.approved
    : result.verifiedCompleted && result.decision === 'accept_completion'
}

function gateRejected(result: SessionOutcomeInput['completionGateResult']): boolean {
  if (!result) return false
  return 'approved' in result ? !result.approved : result.decision === 'reject_completion'
}

function gateReason(result: SessionOutcomeInput['completionGateResult']): string | undefined {
  if (!result) return undefined
  return 'approved' in result ? result.reason : result.reasons[0]
}

export function buildSessionOutcomeV2(input: SessionOutcomeInput): SessionOutcomeV2 {
  const { sessionPlan, integrityResult, closureResponse, completionGateResult } = input
  const contract = sessionPlan.contract
  const closure = sessionPlan.closure ?? {
    required: contract.requiresClosureReview,
    requiresSpecificAnswer: false,
    minimumSpecificityScore: 0,
  }
  const selected = closureResponse?.selectedOutcome
  const integrityScore = integrityResult?.integrityScore ?? 0
  const activeMinutes = Math.max(0, integrityResult?.activeDurationMinutes ?? 0)
  const specificity = clampScore(closureResponse?.specificityScore ?? 0)
  const answer = closureResponse?.answerText?.trim() ?? ''
  const answerIsSpecific =
    !closure.requiresSpecificAnswer ||
    (specificity >= closure.minimumSpecificityScore && answer.split(/\s+/u).filter(Boolean).length >= 3)
  const reasons: string[] = []
  const warnings: string[] = []
  const confidence = integrityResult ? Math.min(100, integrityResult.confidence + 10) : 25
  let outcome: SessionOutcomeV2['outcome'] = 'manual_review_required'
  let verifiedProgressMinutes = 0
  let shouldReduceRemainingMinutes = false
  let shouldMarkTaskCompleted = false
  let completionAccepted = false

  if (!integrityResult) warnings.push('Aucun résultat d’intégrité: la présence et le progrès ne peuvent pas être confondus.')
  if (contract.requiresClosureReview && !closureResponse) {
    reasons.push('Le contrat exige une clôture, mais aucune réponse n’a été fournie.')
    return {
      sessionId: sessionPlan.id,
      outcome: 'manual_review_required',
      verifiedProgressMinutes: 0,
      shouldReduceRemainingMinutes: false,
      shouldMarkTaskCompleted: false,
      completionAccepted: false,
      reasons,
      warnings,
      confidence: clampScore(confidence - 30),
    }
  }

  if (selected === 'no_progress') {
    outcome = 'no_progress_confirmed'
    reasons.push('La clôture confirme qu’aucun progrès vérifiable n’a été produit.')
  } else if (selected === 'partial_progress' || selected === 'confirmed_progress') {
    if (!integrityResult || integrityScore < 30 || !answerIsSpecific) {
      outcome = 'manual_review_required'
      warnings.push('Les signaux ou la réponse sont insuffisants pour valider le progrès annoncé.')
    } else {
      const factor = selected === 'partial_progress' || integrityScore < 60 ? 0.5 : 1
      verifiedProgressMinutes = Math.floor(activeMinutes * factor)
      shouldReduceRemainingMinutes = verifiedProgressMinutes > 0
      outcome = selected === 'confirmed_progress' && integrityScore >= 60
        ? 'progress_confirmed'
        : 'partial_progress'
      reasons.push(outcome === 'progress_confirmed'
        ? 'Le progrès est confirmé par une clôture spécifique et des signaux d’intégrité suffisants.'
        : 'Seule une partie prudente du progrès annoncé est retenue.')
    }
  } else if (selected === 'claimed_completed') {
    if (!contract.allowedToMarkTaskCompleted || contract.targetType !== 'task') {
      outcome = 'completion_rejected'
      reasons.push('Le contrat de cette session interdit la complétion d’une tâche.')
    } else if (contract.completionPolicy !== 'completion_gate') {
      outcome = 'manual_review_required'
      warnings.push('Une déclaration de complétion sans completion gate reste une revendication non vérifiée.')
    } else if (!answerIsSpecific || integrityScore < 60) {
      outcome = 'completion_rejected'
      warnings.push('L’intégrité ou la précision de la clôture est trop faible pour accepter la complétion.')
    } else if (gateRejected(completionGateResult)) {
      outcome = 'completion_rejected'
      reasons.push(`Le completion gate a rejeté la demande${gateReason(completionGateResult) ? ` : ${gateReason(completionGateResult)}` : '.'}`)
    } else if (!completionGateResult) {
      outcome = 'manual_review_required'
      reasons.push('Le completion gate requis n’a produit aucun résultat.')
    } else if (gateApproved(completionGateResult)) {
      outcome = 'completion_verified'
      verifiedProgressMinutes = Math.min(activeMinutes, Math.max(activeMinutes, sessionPlan.minimumUsefulMinutes))
      shouldReduceRemainingMinutes = true
      shouldMarkTaskCompleted = true
      completionAccepted = true
      reasons.push('La clôture spécifique, l’intégrité et le completion gate valident ensemble la complétion.')
    }
  } else if (!selected) {
    outcome = integrityResult && !contract.requiresClosureReview && integrityScore >= 60
      ? 'progress_confirmed'
      : integrityResult && activeMinutes === 0
        ? 'no_progress_confirmed'
        : 'manual_review_required'
    if (outcome === 'progress_confirmed') {
      verifiedProgressMinutes = activeMinutes
      shouldReduceRemainingMinutes = verifiedProgressMinutes > 0
      reasons.push('La session légère confirme du progrès, jamais la complétion de la tâche.')
    }
  }

  if (!Number.isFinite(verifiedProgressMinutes)) verifiedProgressMinutes = 0
  return {
    sessionId: sessionPlan.id,
    outcome,
    verifiedProgressMinutes: Math.max(0, Math.round(verifiedProgressMinutes)),
    shouldReduceRemainingMinutes,
    shouldMarkTaskCompleted,
    completionAccepted,
    reasons,
    warnings,
    confidence: clampScore(confidence),
  }
}
