import type { SessionClosurePlan, SessionContract, SessionPlanV2 } from '@shared/session-model'

export interface SessionClosureInput {
  contract: SessionContract
  sessionPlan?: Pick<SessionPlanV2, 'mode'>
  taskModelV2?: unknown
  objectiveModelV2?: unknown
  deadlineCrisisContext?: unknown
  userModel?: unknown
}

export function buildSessionClosurePlan(input: SessionClosureInput): SessionClosurePlan {
  const { contract, sessionPlan, deadlineCrisisContext } = input

  let required = contract.requiresClosureReview
  let closurePromptType: SessionClosurePlan['closurePromptType'] = 'simple'
  const questions: string[] = []
  let allowedOutcomes: SessionClosurePlan['allowedOutcomes'] = 'confirmed_progress'
  let requiresSpecificAnswer = false
  let minimumSpecificityScore = 0
  const reasons: string[] = []

  const isRescue = sessionPlan?.mode === 'rescue' || (deadlineCrisisContext as any)?.recommendedMode === 'rescue_plan'

  if (contract.completionPolicy === 'completion_gate') {
    required = true
    closurePromptType = 'completion_gate'
    questions.push("Cette tâche requiert une validation stricte. Quelle partie exacte a été terminée ?")
    questions.push("Quelles preuves (liens, commits, artefacts) confirment cette complétion ?")
    allowedOutcomes = 'claimed_completed'
    requiresSpecificAnswer = true
    minimumSpecificityScore = 70
    reasons.push("Politique de completion_gate activée pour valider rigoureusement le statut 'terminé'.")
  } else if (contract.completionPolicy === 'manual_review') {
    required = true
    closurePromptType = 'manual_review'
    questions.push("La tâche initiale était vague. Qu'avez-vous clarifié ou accompli concrètement ?")
    allowedOutcomes = 'partial_progress'
    requiresSpecificAnswer = true
    minimumSpecificityScore = 50
    reasons.push("Review manuel exigé pour clarifier une action incertaine.")
  } else if (contract.completionPolicy === 'progress_review') {
    required = true
    closurePromptType = 'progress_review'
    
    if (isRescue) {
      questions.push("Mode Rescue : Qu'est-ce qui a été sauvé/produit pendant cette session ?")
      questions.push("Que reste-t-il à faire en priorité ?")
      allowedOutcomes = 'confirmed_progress'
      reasons.push("En mode rescue, on s'assure d'une progression utile plutôt que d'une simple complétion.")
    } else {
      questions.push("Décrivez brièvement les progrès réalisés.")
      allowedOutcomes = 'confirmed_progress'
    }
    requiresSpecificAnswer = contract.requiresStrictEvidence
    minimumSpecificityScore = requiresSpecificAnswer ? 40 : 20
  } else {
    // session_only
    required = false
    closurePromptType = 'simple'
    allowedOutcomes = 'confirmed_progress'
    reasons.push("Fermeture simple. Aucune donnée spécifique n'est exigée.")
  }

  // Override allowed outcomes based on target type
  if (contract.targetType === 'strategy_block' || contract.targetType === 'objective') {
    // Cannot claim a specific task completed
    if (allowedOutcomes === 'claimed_completed') {
      allowedOutcomes = 'confirmed_progress'
      reasons.push("On ne peut pas marquer 'completed' sur un bloc stratégique ou un objectif vague.")
    }
  }

  return {
    required,
    closurePromptType,
    questions,
    allowedOutcomes,
    requiresSpecificAnswer,
    minimumSpecificityScore,
    reasons
  }
}
