import type { SessionPlanV2, SessionIntegrityResult, SessionOutcomeV2 } from '@shared/session-model'

export interface SessionOutcomeInput {
  sessionPlan: SessionPlanV2
  integrityResult?: SessionIntegrityResult

  closureResponse?: {
    selectedOutcome?: 'no_progress' | 'partial_progress' | 'confirmed_progress' | 'claimed_completed'
    answerText?: string
    specificityScore?: number
  }

  completionGateResult?: {
    approved: boolean
    reason?: string
  }

  userModel?: unknown
}

export function buildSessionOutcomeV2(input: SessionOutcomeInput): SessionOutcomeV2 {
  const { sessionPlan, integrityResult, closureResponse, completionGateResult } = input

  let outcome: SessionOutcomeV2['outcome'] = 'manual_review_required'
  let verifiedProgressMinutes = 0
  let shouldReduceRemainingMinutes = false
  let shouldMarkTaskCompleted = false
  let completionAccepted = false

  const reasons: string[] = []
  const warnings: string[] = []
  let confidence = 100

  const contract = sessionPlan.contract
  const integrityScore = integrityResult?.integrityScore ?? 50
  const isRescue = sessionPlan.mode === 'rescue'

  if (!integrityResult) {
    confidence -= 30
    warnings.push("Résultat d'intégrité manquant. Les conclusions seront extrêmement prudentes.")
  }

  if (contract.requiresClosureReview && !closureResponse) {
    confidence -= 50
    outcome = 'manual_review_required'
    reasons.push("Clôture requise par le contrat mais aucune réponse fournie.")
    return {
      sessionId: sessionPlan.id,
      outcome,
      verifiedProgressMinutes,
      shouldReduceRemainingMinutes,
      shouldMarkTaskCompleted,
      completionAccepted,
      reasons,
      warnings,
      confidence: Math.max(0, confidence)
    }
  }

  const selected = closureResponse?.selectedOutcome

  // Base progress minutes
  const activeMinutes = integrityResult?.activeDurationMinutes ?? 0
  if (integrityScore > 70) {
    verifiedProgressMinutes = activeMinutes
  } else if (integrityScore > 30) {
    verifiedProgressMinutes = Math.floor(activeMinutes * 0.5)
  }

  if (selected === 'no_progress') {
    outcome = 'no_progress_confirmed'
    verifiedProgressMinutes = 0
    reasons.push("L'utilisateur a confirmé n'avoir fait aucun progrès.")
  } else if (selected === 'partial_progress') {
    if (integrityScore >= 30) {
      outcome = 'partial_progress'
      shouldReduceRemainingMinutes = true
      reasons.push("Progrès partiel accepté basé sur l'intégrité et la déclaration.")
    } else {
      outcome = 'manual_review_required'
      warnings.push("Progrès partiel réclamé, mais l'intégrité est trop faible pour valider automatiquement.")
    }
  } else if (selected === 'confirmed_progress') {
    if (integrityScore >= 50) {
      outcome = 'progress_confirmed'
      shouldReduceRemainingMinutes = true
      reasons.push("Progrès confirmé accepté.")
      if (isRescue) {
        reasons.push("En mode rescue, le progrès est un succès stratégique suffisant.")
      }
    } else {
      outcome = 'partial_progress' // Downgrade
      shouldReduceRemainingMinutes = true
      verifiedProgressMinutes = Math.floor(activeMinutes * 0.25)
      warnings.push("Progrès confirmé rétrogradé en progrès partiel en raison d'une intégrité faible.")
    }
  } else if (selected === 'claimed_completed') {
    if (!contract.allowedToMarkTaskCompleted) {
      outcome = 'completion_rejected'
      reasons.push("La tâche ne peut pas être marquée terminée depuis cette session (contrat strict ou strategy_block).")
    } else if (contract.completionPolicy === 'completion_gate') {
      if (completionGateResult?.approved) {
        outcome = 'completion_verified'
        shouldReduceRemainingMinutes = true
        shouldMarkTaskCompleted = true
        completionAccepted = true
        reasons.push("Complétion vérifiée et acceptée par le Completion Gate.")
      } else if (completionGateResult && !completionGateResult.approved) {
        outcome = 'completion_rejected'
        reasons.push(`Complétion rejetée par le Gate : ${completionGateResult.reason}`)
      } else {
        outcome = 'manual_review_required'
        reasons.push("Completion Gate requis mais aucun résultat fourni. Revue manuelle requise.")
      }
    } else {
      // Un integrity score élevé seul ne suffit jamais pour la complétion.
      outcome = 'manual_review_required'
      warnings.push("L'intégrité seule ne permet pas de vérifier la complétion. Revue manuelle requise.")
    }
  } else if (!selected) {
    // Session without closure required
    if (!contract.requiresClosureReview && integrityScore >= 50) {
      outcome = 'progress_confirmed'
      shouldReduceRemainingMinutes = true
      reasons.push("Session terminée sans revue requise, intégrité suffisante pour confirmer le progrès.")
    } else {
      outcome = 'manual_review_required'
    }
  }

  // Adjust remaining minutes logically, though it's shadow
  // If we should MarkTaskCompleted, we definitely reduce remaining minutes
  if (shouldMarkTaskCompleted) {
    verifiedProgressMinutes = Math.max(verifiedProgressMinutes, sessionPlan.plannedDurationMinutes) // ensure we credit it
  }

  return {
    sessionId: sessionPlan.id,
    outcome,
    verifiedProgressMinutes,
    shouldReduceRemainingMinutes,
    shouldMarkTaskCompleted,
    completionAccepted,
    reasons,
    warnings,
    confidence: Math.max(0, confidence)
  }
}
