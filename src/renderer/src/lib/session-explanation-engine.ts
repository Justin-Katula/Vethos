import type { SessionPlanV2, SessionPreflightResult, SessionProtectionPlan, SessionOutcomeV2 } from '@shared/session-model'

export function explainSessionPlan(sessionPlan: SessionPlanV2) {
  const isStrict = sessionPlan.protection.mode === 'strict_allowlist'
  
  return {
    title: sessionPlan.title,
    summary: `Session de ${sessionPlan.plannedDurationMinutes} min prévue à ${sessionPlan.plannedStart}.`,
    reasons: sessionPlan.contract.reasons.concat(sessionPlan.protection.reasons),
    warnings: []
  }
}

export function explainSessionPreflight(preflight: SessionPreflightResult) {
  return {
    title: preflight.canStart ? "Prêt au démarrage" : "Démarrage bloqué",
    summary: preflight.canStart ? "Les conditions pour démarrer sont remplies." : "La session ne peut pas démarrer en l'état.",
    reasons: preflight.blockers.length > 0 ? preflight.blockers : ["Aucun bloqueur critique."],
    warnings: preflight.warnings
  }
}

export function explainSessionProtectionPlan(protection: SessionProtectionPlan) {
  return {
    title: "Plan de Protection",
    summary: `Mode : ${protection.mode}`,
    reasons: protection.reasons,
    warnings: protection.warnings
  }
}

export function explainSessionOutcome(outcome: SessionOutcomeV2) {
  let summary = ""
  if (outcome.outcome === 'completion_verified') summary = "La tâche est validée comme terminée."
  else if (outcome.outcome === 'progress_confirmed') summary = "Le progrès est confirmé."
  else if (outcome.outcome === 'partial_progress') summary = "Un progrès partiel a été enregistré."
  else if (outcome.outcome === 'completion_rejected') summary = "Les preuves sont insuffisantes pour valider la complétion totale."
  else if (outcome.outcome === 'manual_review_required') summary = "Une vérification humaine supplémentaire est requise."
  else summary = "Aucun progrès n'a été validé."

  return {
    title: "Bilan de la Session",
    summary,
    reasons: outcome.reasons,
    warnings: outcome.warnings
  }
}
