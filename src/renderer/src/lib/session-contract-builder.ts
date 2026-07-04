import type { SessionCompletionPolicy, SessionContract } from '@shared/session-model'
import type { SessionInputData, SessionTaskModel } from './session-input-adapter'
import {
  sessionPriorityProtection,
  sessionPriorityTotal,
  sessionTaskTitle,
} from './session-input-adapter'

function taskIsVague(task: SessionTaskModel | undefined): boolean {
  if (!task) return true
  if ('identity' in task) {
    return task.lifecycle === 'unclear' || task.nextStep.kind === 'clarify_task' || task.risk.ambiguityRiskScore >= 60
  }
  return task.isVague === true || task.recommendedAction === 'clarify'
}

function taskIsImportant(task: SessionTaskModel | undefined, score: number): boolean {
  if (score >= 75) return true
  if (!task || !('purpose' in task)) return false
  return task.purpose.strength === 'important' || task.purpose.strength === 'mission_critical'
}

function expectedTaskOutcome(task: SessionTaskModel | undefined): string | undefined {
  if (!task || !('nextStep' in task) || task.nextStep.kind === 'none') return undefined
  return task.nextStep.label.trim() || undefined
}

function taskCompletionCriteria(task: SessionTaskModel | undefined, vague: boolean): string[] {
  if (!task || vague) return []
  const criteria = [
    'Décrire précisément le résultat obtenu pendant la session.',
    'Fournir une preuve vérifiable correspondant au résultat annoncé.',
  ]
  if ('completionVerification' in task && task.completionVerification.reasons.length > 0) {
    criteria.push(...task.completionVerification.reasons.slice(0, 2))
  }
  return Array.from(new Set(criteria))
}

export function buildSessionContract(input: SessionInputData): SessionContract {
  const { targetType, targetId, placementBlock, linkedTask, linkedObjective, deadlineCrisisContext, userModel } = input
  const reasons: string[] = []
  let confidence = input.confidence
  let purpose = placementBlock.title
  let expectedOutcome: string | undefined
  let progressDefinition: SessionContract['progressDefinition'] = 'unknown'
  let completionPolicy: SessionCompletionPolicy = 'session_only'
  let completionCriteria: string[] = []
  let allowedToMarkTaskCompleted = false
  let requiresClosureReview = false

  const priority = sessionPriorityTotal(input.priorityScore)
  const vague = targetType === 'task' && taskIsVague(linkedTask)
  const important = targetType === 'task' && taskIsImportant(linkedTask, priority)
  const crisisLevel = deadlineCrisisContext?.crisisLevel
  const rescue = placementBlock.placementMode === 'rescue' || deadlineCrisisContext?.recommendedMode === 'rescue_plan'
  const seriousMode = ['deep_work', 'intensive', 'rescue'].includes(placementBlock.placementMode)
  const taskProtection = linkedTask && 'protection' in linkedTask
    ? linkedTask.protection.recommendedProtectionLevel
    : 0
  const disciplineRisk = userModel?.disciplineModel.globalDistractionRisk ?? 0
  const circumventionRisk = disciplineRisk >= 60 || userModel?.disciplineModel.unlockPattern.frequentRequests === true

  if (targetType === 'strategy_block') {
    purpose = `Défendre l’intention stratégique : ${placementBlock.title}`
    progressDefinition = 'review_progress'
    completionPolicy = 'session_only'
    requiresClosureReview = true
    reasons.push('Un bloc stratégique organise une action; il ne crée ni ne termine une tâche réelle.')
  } else if (targetType === 'objective') {
    const objectiveTitle = linkedObjective && 'identity' in linkedObjective
      ? linkedObjective.identity.title
      : linkedObjective?.title ?? targetId
    purpose = `Transformer l’objectif en prochaine action : ${objectiveTitle}`
    progressDefinition = 'manual_review'
    completionPolicy = 'manual_review'
    requiresClosureReview = true
    expectedOutcome = 'Une prochaine action concrète ou une décision de revue.'
    reasons.push('Un objectif sans tâche précise exige une revue ou la création d’une prochaine action, pas du travail profond supposé.')
  } else {
    purpose = `Faire avancer la tâche : ${sessionTaskTitle(linkedTask) ?? targetId}`
    expectedOutcome = expectedTaskOutcome(linkedTask)
    completionCriteria = taskCompletionCriteria(linkedTask, vague)
    requiresClosureReview = true

    if (!linkedTask || vague) {
      progressDefinition = 'manual_review'
      completionPolicy = 'manual_review'
      reasons.push('La cible est absente ou trop vague; la session doit d’abord la clarifier.')
    } else if (rescue) {
      progressDefinition = 'artifact_progress'
      completionPolicy = 'progress_review'
      reasons.push('Le mode rescue valide uniquement ce qui a réellement avancé, sans promettre la complétion totale.')
    } else if (important || seriousMode) {
      progressDefinition = 'artifact_progress'
      completionPolicy = 'completion_gate'
      reasons.push('L’importance ou l’intensité de la session impose un completion gate avant toute complétion de tâche.')
    } else {
      progressDefinition = 'time_on_task'
      completionPolicy = 'progress_review'
      reasons.push('Le progrès doit être revu séparément de la simple présence dans la session.')
    }
  }

  const missingCriteria = completionCriteria.length === 0
  const impossibleCompletion = crisisLevel === 'impossible_full_completion'
  const lowConfidence = input.confidence < 50
  allowedToMarkTaskCompleted =
    targetType === 'task' &&
    Boolean(linkedTask) &&
    !vague &&
    !lowConfidence &&
    !missingCriteria &&
    !impossibleCompletion

  if (lowConfidence) reasons.push('La confiance est trop basse pour autoriser une complétion automatique.')
  if (missingCriteria && targetType === 'task') reasons.push('Aucun critère de complétion fiable n’est disponible.')
  if (impossibleCompletion) reasons.push('Le contexte de deadline indique qu’une complétion totale n’est pas crédible.')

  const requiresStrictEvidence =
    important ||
    taskProtection >= 70 ||
    sessionPriorityProtection(input.priorityScore) >= 70 ||
    crisisLevel === 'critical' ||
    crisisLevel === 'rescue_required' ||
    impossibleCompletion ||
    circumventionRisk ||
    seriousMode

  if (requiresStrictEvidence) reasons.push('Les signaux d’importance, de protection, de deadline ou de contournement exigent des preuves strictes.')
  if (input.requiresManualReview === true) confidence = Math.min(confidence, 40)

  return {
    targetType,
    targetId,
    purpose,
    ...(expectedOutcome ? { expectedOutcome } : {}),
    progressDefinition,
    completionPolicy,
    completionCriteria,
    allowedToMarkTaskCompleted,
    requiresClosureReview,
    requiresStrictEvidence,
    reasons: Array.from(new Set(reasons)),
    confidence: Math.max(0, Math.min(100, Number.isFinite(confidence) ? confidence : 0)),
  }
}
