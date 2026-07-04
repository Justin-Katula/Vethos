import type { SessionContract, SessionPreflightResult, SessionProtectionPlan, SessionStartReadiness } from '@shared/session-model'
import type { SessionInputData, SessionTaskModel } from './session-input-adapter'

export interface SessionPreflightInput {
  contract: SessionContract
  inputData: SessionInputData
  protection?: SessionProtectionPlan
  now?: string
}

function addUnique<T>(items: T[], value: T): void {
  if (!items.includes(value)) items.push(value)
}

function taskCompleted(task: SessionTaskModel | undefined): boolean {
  if (!task) return false
  return 'identity' in task
    ? task.identity.status === 'completed'
    : task.status === 'completed' || task.status === 'completed_verified'
}

function taskVague(task: SessionTaskModel | undefined): boolean {
  if (!task) return true
  return 'identity' in task
    ? task.lifecycle === 'unclear' || task.nextStep.kind === 'clarify_task' || task.risk.ambiguityRiskScore >= 60
    : task.isVague === true || task.recommendedAction === 'clarify'
}

function taskNeedsSplit(task: SessionTaskModel | undefined): boolean {
  if (!task) return false
  return 'identity' in task ? task.workload.shouldBeSplit : task.recommendedAction === 'split_first'
}

function taskDeadline(task: SessionTaskModel | undefined): string | undefined {
  if (!task) return undefined
  return 'identity' in task ? task.urgency.deadline : task.deadline
}

function objectiveHasNextAction(input: SessionInputData): boolean {
  const objective = input.linkedObjective
  if (!objective) return false
  return 'nextAction' in objective
    ? objective.nextAction.suggestedActionType !== 'review_objective' && objective.nextAction.suggestedActionType !== 'create_task'
    : objective.hasClearNextAction !== false
}

function plannedInstant(date: string, time: string): number {
  return new Date(`${date}T${time}:00`).getTime()
}

export function runSessionPreflight(input: SessionPreflightInput): SessionPreflightResult {
  const { contract, inputData, protection } = input
  const now = input.now ?? new Date().toISOString()
  const { placementBlock, linkedTask } = inputData
  let canStart = true
  let readiness: SessionStartReadiness = 'ready'
  const blockers: string[] = []
  const warnings = [...inputData.warnings]
  const requiredActions: SessionPreflightResult['requiredActions'] = []
  let confidence = Math.min(contract.confidence, protection?.confidence ?? 100, inputData.confidence)

  const invalidBlock =
    !placementBlock.id || !placementBlock.targetId || !placementBlock.date ||
    !placementBlock.start || !placementBlock.end || !placementBlock.sourceWindowId
  if (invalidBlock) {
    canStart = false
    blockers.push('Le bloc de placement est incomplet ou invalide.')
    readiness = 'blocked_by_missing_data'
    addUnique(requiredActions, 'manual_review')
  }
  if (!Number.isFinite(placementBlock.durationMinutes) || placementBlock.durationMinutes <= 0) {
    canStart = false
    blockers.push('La durée de session doit être strictement positive.')
    readiness = 'blocked_by_schedule'
    addUnique(requiredActions, 'manual_review')
  }

  const start = plannedInstant(placementBlock.date, placementBlock.start)
  const end = plannedInstant(placementBlock.date, placementBlock.end)
  const nowTime = new Date(now).getTime()
  if (![start, end, nowTime].every(Number.isFinite) || start >= end) {
    canStart = false
    blockers.push('Les horaires de la session sont invalides ou incohérents.')
    readiness = 'blocked_by_schedule'
    addUnique(requiredActions, 'manual_review')
  }

  const targetFound = inputData.targetFound ?? (
    contract.targetType === 'strategy_block' ||
    (contract.targetType === 'task' && Boolean(inputData.linkedTask)) ||
    (contract.targetType === 'objective' && Boolean(inputData.linkedObjective))
  )
  if (!targetFound) {
    canStart = false
    blockers.push('La cible du bloc est introuvable.')
    readiness = 'blocked_by_missing_data'
    addUnique(requiredActions, 'manual_review')
  } else if (contract.targetType === 'task') {
    if (taskCompleted(linkedTask)) {
      canStart = false
      blockers.push('La tâche cible est déjà terminée et ne doit pas être relancée comme travail actif.')
      readiness = 'blocked_by_unclear_target'
      addUnique(requiredActions, 'manual_review')
    }
    if (taskVague(linkedTask) && ['work', 'deep_work'].includes(placementBlock.kind)) {
      canStart = false
      blockers.push('La tâche est trop vague pour cette forme de travail.')
      readiness = 'blocked_by_unclear_target'
      addUnique(requiredActions, 'clarify_task')
    }
    if (taskNeedsSplit(linkedTask)) {
      warnings.push('La tâche devrait être découpée avant une session lourde.')
      addUnique(requiredActions, 'split_task')
      if (placementBlock.kind === 'deep_work' || placementBlock.placementMode === 'deep_work') {
        canStart = false
        blockers.push('Le découpage est requis avant une session de deep work.')
        readiness = 'blocked_by_unclear_target'
      }
    }
  } else if (contract.targetType === 'objective' && !objectiveHasNextAction(inputData)) {
    addUnique(requiredActions, 'clarify_task')
    if (placementBlock.kind === 'deep_work' || placementBlock.placementMode === 'deep_work') {
      canStart = false
      blockers.push('Cet objectif n’a aucune prochaine action assez claire pour du deep work.')
      readiness = 'blocked_by_unclear_target'
    } else {
      warnings.push('La session doit produire une prochaine action concrète.')
    }
  }

  const deadline = taskDeadline(linkedTask)
  const deadlinePassed =
    inputData.deadlineCrisisContext?.crisisLevel === 'impossible_full_completion' ||
    (deadline ? new Date(`${deadline}T23:59:59`).getTime() < nowTime : false)
  if (deadlinePassed) {
    addUnique(requiredActions, 'review_deadline')
    if (!['rescue', 'manual_review'].includes(placementBlock.placementMode)) {
      canStart = false
      blockers.push('La deadline est passée; une stratégie rescue ou une revue manuelle est requise.')
      readiness = 'blocked_by_schedule'
    } else {
      warnings.push('La deadline est passée; la session ne peut valider que le progrès réellement démontré.')
    }
  }

  if (Number.isFinite(start) && Number.isFinite(end) && Number.isFinite(nowTime)) {
    if (start > nowTime + 15 * 60_000) {
      addUnique(requiredActions, 'wait_for_planned_time')
      warnings.push('La session est prête, mais son heure de début n’est pas encore atteinte.')
    } else if (end < nowTime - 15 * 60_000 && !['rescue', 'manual_review'].includes(placementBlock.placementMode)) {
      canStart = false
      blockers.push('La session planifiée est passée sans politique de rattrapage explicite.')
      readiness = 'blocked_by_schedule'
      addUnique(requiredActions, 'manual_review')
    }
  }

  if (protection && ['allowlist', 'strict_allowlist'].includes(protection.mode) && protection.usefulApps.length + protection.usefulSites.length === 0) {
    warnings.push('Aucune application ou aucun site utile n’est connu pour la protection demandée.')
    addUnique(requiredActions, 'choose_apps')
    if (protection.mode === 'strict_allowlist') {
      canStart = false
      readiness = 'manual_review_required'
      blockers.push('Une allowlist stricte vide bloquerait les outils de travail; choisissez d’abord les ressources utiles.')
    }
  }
  if (protection && protection.confidence >= 40 && protection.confidence < 70) {
    warnings.push('La protection est exploitable mais sa confiance reste moyenne.')
  }

  const planningDay = inputData.planningContext?.days.find((day) => day.date === placementBlock.date)
  const endMinute = Number(placementBlock.end.slice(0, 2)) * 60 + Number(placementBlock.end.slice(3, 5))
  const nearSleep = planningDay?.timeline.some((segment) => {
    if (segment.kind !== 'sleep') return false
    const startMinute = Number(segment.start.slice(0, 2)) * 60 + Number(segment.start.slice(3, 5))
    return startMinute >= endMinute && startMinute - endMinute <= 60
  })
  if (nearSleep) warnings.push('La session est proche d’une période de sommeil protégée; aucun overtime ne doit l’empiéter.')
  if (planningDay && ['overloaded', 'no_usable_time'].includes(planningDay.status)) {
    warnings.push('La capacité de récupération de cette journée est limitée.')
  }

  if (Math.min(inputData.confidence, contract.confidence) < 60) {
    warnings.push('Les données sont partielles; la session exige une revue prudente.')
    addUnique(requiredActions, 'manual_review')
    confidence = Math.min(confidence, inputData.confidence, contract.confidence)
    if (canStart) readiness = 'ready_with_warnings'
  }
  if (canStart && warnings.length > 0 && readiness === 'ready') readiness = 'ready_with_warnings'
  if (!canStart && readiness === 'ready') readiness = 'blocked_by_missing_data'

  return {
    readiness,
    canStart,
    blockers: Array.from(new Set(blockers)),
    warnings: Array.from(new Set(warnings)),
    requiredActions,
    confidence: Math.max(0, Math.min(100, Number.isFinite(confidence) ? confidence : 0)),
  }
}
