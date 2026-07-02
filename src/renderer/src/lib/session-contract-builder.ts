import type { SessionContract, SessionCompletionPolicy } from '@shared/session-model'
import type { SessionInputData } from './session-input-adapter'

export function buildSessionContract(input: SessionInputData): SessionContract {
  const { targetType, targetId, placementBlock, linkedTask, linkedObjective, deadlineCrisisContext, userModel } = input

  const reasons: string[] = []
  let confidence = input.confidence

  let purpose = placementBlock.title
  let progressDefinition: SessionContract['progressDefinition'] = 'unknown'
  let completionPolicy: SessionCompletionPolicy = 'session_only'
  let completionCriteria: string[] = []
  let allowedToMarkTaskCompleted = false
  let requiresClosureReview = false
  let requiresStrictEvidence = false

  const isImportant = (input.priorityScore?.priorityScore ?? 0) >= 80
  const isRescue = placementBlock.placementMode === 'rescue'
  const isDeepWork = placementBlock.placementMode === 'deep_work' || placementBlock.kind === 'deep_work'

  if (targetType === 'strategy_block') {
    purpose = `Session stratégique : ${placementBlock.title}`
    progressDefinition = 'time_on_task'
    completionPolicy = 'session_only'
    allowedToMarkTaskCompleted = false
    reasons.push("Les blocs de stratégie ne permettent pas de valider une tâche concrète.")
  } else if (targetType === 'objective') {
    purpose = `Avancement sur l'objectif : ${linkedObjective?.title ?? targetId}`
    progressDefinition = 'review_progress'
    completionPolicy = 'progress_review'
    allowedToMarkTaskCompleted = false
    reasons.push("Cette session travaille sur un objectif global sans tâche précise associée. La clôture demandera un résumé d'avancement.")
  } else if (targetType === 'task') {
    purpose = `Exécution de la tâche : ${linkedTask?.title ?? targetId}`
    
    const isVague = linkedTask?.isVague || linkedTask?.recommendedAction === 'clarify'
    
    if (isVague) {
      progressDefinition = 'manual_review'
      completionPolicy = 'manual_review'
      allowedToMarkTaskCompleted = false
      requiresClosureReview = true
      reasons.push("La tâche cible est vague. La session vise à clarifier ou évaluer la faisabilité de l'action.")
    } else {
      progressDefinition = 'time_on_task' // Fallback, could be overridden by specific signals
      completionPolicy = 'progress_review'
      allowedToMarkTaskCompleted = true
      
      if (isRescue || deadlineCrisisContext?.recommendedMode === 'rescue_plan') {
        progressDefinition = 'practice_progress'
        completionPolicy = 'progress_review'
        requiresClosureReview = true
        reasons.push("Plan de sauvetage en cours. L'objectif est d'avancer stratégiquement, pas nécessairement de terminer 100%.")
      } else if (isImportant || isDeepWork) {
        progressDefinition = 'artifact_progress'
        completionPolicy = 'completion_gate'
        requiresClosureReview = true
        requiresStrictEvidence = true
        reasons.push("Tâche importante ou travail profond identifié. Une validation stricte est requise pour la clôture.")
      }
    }
  }

  // UserModel discipline risk could force strict evidence
  const userRiskLevel = (userModel as any)?.disciplineRiskLevel
  if (userRiskLevel === 'high' || userRiskLevel === 'critical') {
    requiresStrictEvidence = true
    reasons.push("Le niveau de risque disciplinaire justifie une collecte de preuves strictes.")
  }

  // Crisis context "impossible_full_completion" completely blocks task completion
  if (deadlineCrisisContext?.crisisLevel === 'impossible_full_completion') {
    allowedToMarkTaskCompleted = false
    reasons.push("Complétion totale impossible vu la deadline (contexte de crise).")
  }

  if (completionPolicy === 'completion_gate' || completionPolicy === 'manual_review') {
    requiresClosureReview = true
  }

  if (allowedToMarkTaskCompleted && completionCriteria.length === 0) {
    // If we have no structured criteria yet, we should probably warn or require review, 
    // but we let it pass if it's a simple task. For important ones, we rely on the completion_gate.
  }

  return {
    targetType,
    targetId,
    purpose,
    expectedOutcome: undefined, // To be refined if signals are present
    progressDefinition,
    completionPolicy,
    completionCriteria,
    allowedToMarkTaskCompleted,
    requiresClosureReview,
    requiresStrictEvidence,
    reasons,
    confidence
  }
}
