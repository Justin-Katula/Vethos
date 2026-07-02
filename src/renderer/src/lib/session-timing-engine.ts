import type { SessionInputData } from './session-input-adapter'
import type { SessionLifecycleProjection } from '@shared/session-model'

export interface SessionTimingResult {
  plannedStart: string
  plannedEnd: string
  plannedDurationMinutes: number
  minimumUsefulMinutes: number
  maximumSafeMinutes: number
  lateStartGraceMinutes: number
  earlyStopPenaltyMinutes: number
  allowPause: boolean
  maxPauseMinutes?: number
  overtimePolicy: SessionLifecycleProjection['overtimePolicy']
  reasons: string[]
  warnings: string[]
  confidence: number
}

export function buildSessionTiming(input: SessionInputData): SessionTimingResult {
  const { placementBlock, deadlineCrisisContext, linkedTask } = input
  
  const reasons: string[] = []
  const warnings: string[] = []
  let confidence = input.confidence

  const plannedStart = placementBlock.start
  const plannedEnd = placementBlock.end
  const plannedDurationMinutes = placementBlock.durationMinutes

  let minimumUsefulMinutes = 15
  let maximumSafeMinutes = 180
  let lateStartGraceMinutes = 10
  let earlyStopPenaltyMinutes = 5
  let allowPause = false
  let maxPauseMinutes: number | undefined = undefined
  let overtimePolicy: SessionLifecycleProjection['overtimePolicy'] = 'ask_before_overtime'

  const isRescue = placementBlock.placementMode === 'rescue' || deadlineCrisisContext?.recommendedMode === 'rescue_plan'
  const isDeepWork = placementBlock.placementMode === 'deep_work' || placementBlock.kind === 'deep_work'
  const isReview = placementBlock.kind === 'review' || placementBlock.kind === 'manual_review'

  if (plannedDurationMinutes < 10) {
    warnings.push("Durée prévue très courte (< 10m).")
    minimumUsefulMinutes = Math.min(5, plannedDurationMinutes)
    allowPause = false
    overtimePolicy = 'allow_short_overtime'
  } else if (plannedDurationMinutes > 120) {
    warnings.push("Durée prévue très longue (> 2h).")
    allowPause = true
    maxPauseMinutes = 15
    overtimePolicy = 'deny_overtime'
    reasons.push("Les longues sessions nécessitent des pauses pour éviter l'épuisement.")
  }

  if (isDeepWork) {
    minimumUsefulMinutes = Math.max(30, Math.floor(plannedDurationMinutes * 0.5))
    allowPause = plannedDurationMinutes > 60
    if (allowPause) maxPauseMinutes = 10
    lateStartGraceMinutes = 5 // Plus strict sur l'engagement
    reasons.push("Deep work : engagement minimal élevé, pauses très limitées.")
  } else if (isRescue) {
    minimumUsefulMinutes = 10
    allowPause = false // Plan de sauvetage = focus direct
    overtimePolicy = 'deny_overtime' // On évite le dérapage dans un plan calculé à la minute
    reasons.push("Mode Rescue : pause interdite, overtime interdit pour respecter le timing critique.")
  } else if (isReview) {
    minimumUsefulMinutes = 5
    allowPause = true
    maxPauseMinutes = 5
    overtimePolicy = 'allow_short_overtime'
    reasons.push("Review : flexibilité maximale sur la durée.")
  } else {
    // Normal
    minimumUsefulMinutes = Math.floor(plannedDurationMinutes * 0.4)
    allowPause = plannedDurationMinutes >= 45
    if (allowPause) maxPauseMinutes = 5
  }

  if (linkedTask?.requiresDeepWork && !isDeepWork) {
    warnings.push("La tâche requiert du deep work, mais la session n'est pas configurée en deep work strict.")
    confidence -= 10
  }

  // Empêcher d'avoir un min > prévu
  minimumUsefulMinutes = Math.min(minimumUsefulMinutes, Math.max(1, plannedDurationMinutes))

  return {
    plannedStart,
    plannedEnd,
    plannedDurationMinutes,
    minimumUsefulMinutes,
    maximumSafeMinutes,
    lateStartGraceMinutes,
    earlyStopPenaltyMinutes,
    allowPause,
    maxPauseMinutes,
    overtimePolicy,
    reasons,
    warnings,
    confidence: Math.max(0, Math.min(100, confidence))
  }
}
