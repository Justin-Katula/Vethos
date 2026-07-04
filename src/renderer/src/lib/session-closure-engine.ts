import type { DeadlineCrisisContext } from '@shared/planning-time-model'
import type { SessionClosurePlan, SessionContract, SessionPlanV2 } from '@shared/session-model'
import type { UserModel } from '@shared/user-model'
import type { AnyDeadlineCrisisContext } from './placement-input-adapter'

export interface SessionClosureInput {
  contract: SessionContract
  sessionPlan?: Pick<SessionPlanV2, 'mode'>
  deadlineCrisisContext?: DeadlineCrisisContext | AnyDeadlineCrisisContext
  userModel?: UserModel | null
}

const PROGRESS_OUTCOMES: SessionClosurePlan['allowedOutcomes'] = [
  'no_progress',
  'partial_progress',
  'confirmed_progress',
]

export function buildSessionClosurePlan(input: SessionClosureInput): SessionClosurePlan {
  const { contract, sessionPlan, deadlineCrisisContext } = input
  const mode = sessionPlan?.mode
  const rescue = mode === 'rescue' || deadlineCrisisContext?.recommendedMode === 'rescue_plan'
  const serious = contract.requiresStrictEvidence || mode === 'deep_work' || mode === 'intensive' || rescue
  let required = contract.requiresClosureReview || serious
  let closurePromptType: SessionClosurePlan['closurePromptType'] = 'simple'
  const questions: string[] = []
  let allowedOutcomes = [...PROGRESS_OUTCOMES]
  let requiresSpecificAnswer = serious
  let minimumSpecificityScore = serious ? 45 : 20
  const reasons: string[] = []
  const subject = contract.expectedOutcome ?? contract.purpose ?? 'la cible de la session'
  const completionCriteria = contract.completionCriteria ?? []

  if (contract.completionPolicy === 'completion_gate') {
    required = true
    closurePromptType = 'completion_gate'
    questions.push(`Quel résultat précis démontre l’issue attendue « ${subject} » ?`)
    questions.push(`Quelle preuve vérifiable correspond aux critères suivants : ${completionCriteria.join(' · ') || 'résultat précis et preuve associée'} ?`)
    allowedOutcomes = [...PROGRESS_OUTCOMES, 'claimed_completed', 'verified_completed']
    requiresSpecificAnswer = true
    minimumSpecificityScore = contract.requiresStrictEvidence ? 75 : 65
    reasons.push('Une déclaration de complétion reste une revendication jusqu’à validation du completion gate.')
  } else if (contract.completionPolicy === 'manual_review') {
    required = true
    closurePromptType = 'manual_review'
    questions.push(`Qu’est-ce qui a été clarifié ou décidé pour « ${contract.purpose} » ?`)
    questions.push('Quelle prochaine action concrète peut maintenant être exécutée ?')
    requiresSpecificAnswer = true
    minimumSpecificityScore = 50
    reasons.push('La revue manuelle doit transformer une cible incertaine en action explicite.')
  } else if (contract.completionPolicy === 'progress_review') {
    required = true
    closurePromptType = 'progress_review'
    questions.push(`Qu’est-ce qui a réellement avancé vers « ${subject} » ?`)
    questions.push(rescue ? 'Que reste-t-il à défendre en priorité ?' : 'Quelle est la prochaine étape observable ?')
    requiresSpecificAnswer = contract.requiresStrictEvidence || rescue
    minimumSpecificityScore = requiresSpecificAnswer ? 55 : 30
    reasons.push(rescue
      ? 'Le mode rescue juge le progrès utile sans le confondre avec une complétion totale.'
      : 'La clôture sépare le temps passé du progrès confirmé.')
  } else if (serious) {
    required = true
    closurePromptType = 'progress_review'
    questions.push(`Quel changement observable la session a-t-elle produit pour « ${subject} » ?`)
    minimumSpecificityScore = 45
    reasons.push('Toute session sérieuse exige une clôture, même sans politique de complétion.')
  } else {
    required = false
    closurePromptType = 'simple'
    questions.push(`La session a-t-elle produit un progrès vers « ${subject} » ?`)
    reasons.push('La session légère peut se clôturer simplement, sans valider une tâche par défaut.')
  }

  if (contract.targetType !== 'task' || !contract.allowedToMarkTaskCompleted) {
    allowedOutcomes = allowedOutcomes.filter((outcome) => outcome !== 'claimed_completed' && outcome !== 'verified_completed')
    reasons.push('Cette cible ne peut jamais compléter automatiquement une tâche réelle.')
  }

  return {
    required,
    closurePromptType,
    questions,
    allowedOutcomes: Array.from(new Set(allowedOutcomes)),
    requiresSpecificAnswer,
    minimumSpecificityScore,
    reasons,
  }
}
