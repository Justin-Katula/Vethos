import type { SessionContract, SessionPreflightResult, SessionStartReadiness } from '@shared/session-model'
import type { SessionInputData } from './session-input-adapter'

export interface SessionPreflightInput {
  contract: SessionContract
  inputData: SessionInputData
  now?: string
}

export function runSessionPreflight(input: SessionPreflightInput): SessionPreflightResult {
  const { contract, inputData, now = new Date().toISOString() } = input
  const { placementBlock, linkedTask, linkedObjective } = inputData

  let canStart = true
  let readiness: SessionStartReadiness = 'ready'
  const blockers: string[] = []
  const warnings: string[] = []
  const requiredActions: SessionPreflightResult['requiredActions'] = []
  let confidence = contract.confidence

  // Validation fondamentale
  if (placementBlock.durationMinutes <= 0) {
    canStart = false
    blockers.push('Durée de session invalide (<= 0).')
  }

  if (placementBlock.start >= placementBlock.end) {
    canStart = false
    blockers.push('Horaires de début et de fin incohérents.')
  }

  if (contract.targetType === 'task') {
    if (!linkedTask) {
      canStart = false
      blockers.push('Tâche cible introuvable.')
      readiness = 'blocked_by_missing_data'
    } else if (linkedTask.status === 'completed_verified') {
      canStart = false
      blockers.push('La tâche cible est déjà terminée et vérifiée.')
      readiness = 'blocked_by_unclear_target'
    } else if (linkedTask.isVague && contract.completionPolicy === 'completion_gate') {
      canStart = false
      blockers.push('Tâche trop vague pour un travail profond structuré.')
      requiredActions.push('clarify_task')
      readiness = 'blocked_by_unclear_target'
    } else if (linkedTask.recommendedAction === 'split_first') {
      warnings.push('La tâche est trop grosse, un découpage est recommandé.')
      requiredActions.push('split_task')
      if (placementBlock.placementMode === 'deep_work') {
        canStart = false
        blockers.push('Découpage obligatoire avant une session de deep work.')
        readiness = 'blocked_by_unclear_target'
      }
    }
  } else if (contract.targetType === 'objective') {
    if (!linkedObjective) {
      canStart = false
      blockers.push('Objectif cible introuvable.')
      readiness = 'blocked_by_missing_data'
    } else if (linkedObjective.hasClearNextAction === false && placementBlock.placementMode === 'deep_work') {
      canStart = false
      blockers.push("Objectif sans prochaine action claire. Le deep work est impossible.")
      readiness = 'blocked_by_unclear_target'
    }
  }

  // Vérification de la date par rapport à "now"
  // Note: On reste shadow, on ne bloque pas si c'est pour du preview
  // Mais la readiness de "start" doit refléter si c'est dans le futur.
  const blockStart = new Date(`${placementBlock.date}T${placementBlock.start}:00Z`).getTime()
  const nowTime = new Date(now).getTime()

  if (!isNaN(blockStart) && !isNaN(nowTime)) {
    if (blockStart > nowTime + 15 * 60000) {
      // Plus de 15 min dans le futur
      requiredActions.push('wait_for_planned_time')
      warnings.push("Cette session est prévue dans le futur.")
    } else if (blockStart < nowTime - 60 * 60000 && placementBlock.placementMode !== 'rescue' && placementBlock.placementMode !== 'manual_review') {
      // Plus d'une heure dans le passé et pas un plan de sauvetage/review manuel
      warnings.push("Cette session était prévue dans le passé.")
      // On the laisse canStart=true si l'utilisateur veut forcer, on baisse juste la confiance
      confidence -= 10
    }
  }

  if (contract.confidence < 50) {
    warnings.push("La confiance globale des données est basse.")
    requiredActions.push('manual_review')
    if (readiness === 'ready') readiness = 'ready_with_warnings'
  }

  if (canStart && warnings.length > 0) {
    readiness = 'ready_with_warnings'
  }

  if (!canStart && readiness === 'ready') {
    readiness = 'blocked_by_missing_data' // Fallback for unspecified block
  }

  return {
    readiness,
    canStart,
    blockers,
    warnings,
    requiredActions,
    confidence: Math.max(0, Math.min(100, confidence)),
  }
}
