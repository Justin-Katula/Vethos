import type { SessionLifecycleProjection } from '@shared/session-model'
import type { SessionInputData } from './session-input-adapter'

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

function taskSessionLimits(input: SessionInputData): { minimum?: number; maximum?: number } {
  const task = input.linkedTask
  if (!task || !('session' in task)) return {}
  return {
    minimum: task.session.minimumUsefulSessionMinutes,
    maximum: task.session.maximumSafeSessionMinutes,
  }
}

function finiteMinutes(value: number, fallback = 0): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : fallback
}

export function buildSessionTiming(input: SessionInputData): SessionTimingResult {
  const { placementBlock, deadlineCrisisContext } = input
  const reasons: string[] = []
  const warnings: string[] = []
  let confidence = input.confidence
  const plannedDurationMinutes = finiteMinutes(placementBlock.durationMinutes)
  const limits = taskSessionLimits(input)
  let minimumUsefulMinutes = finiteMinutes(limits.minimum ?? Math.min(20, Math.ceil(plannedDurationMinutes * 0.4)))
  let maximumSafeMinutes = finiteMinutes(limits.maximum ?? 120, 120)
  let lateStartGraceMinutes = 10
  let earlyStopPenaltyMinutes = 5
  let allowPause = plannedDurationMinutes >= 45
  let maxPauseMinutes: number | undefined = allowPause ? 5 : undefined
  let overtimePolicy: SessionLifecycleProjection['overtimePolicy'] = 'ask_before_overtime'

  const rescue = placementBlock.placementMode === 'rescue' || deadlineCrisisContext?.recommendedMode === 'rescue_plan'
  const intensive = placementBlock.placementMode === 'intensive' || deadlineCrisisContext?.recommendedMode === 'intensive_plan'
  const deepWork = placementBlock.placementMode === 'deep_work' || placementBlock.kind === 'deep_work'
  const review = ['review', 'manual_review', 'diagnostic'].includes(placementBlock.kind)

  if (plannedDurationMinutes <= 0) {
    warnings.push('La durée de placement est invalide; aucun timer ne doit démarrer.')
    confidence = 0
  } else if (plannedDurationMinutes < 10) {
    minimumUsefulMinutes = plannedDurationMinutes
    allowPause = false
    maxPauseMinutes = undefined
    overtimePolicy = 'allow_short_overtime'
    warnings.push('La session est très courte; son utilité devra être confirmée à la clôture.')
  }

  if (deepWork) {
    minimumUsefulMinutes = Math.max(minimumUsefulMinutes, Math.min(30, plannedDurationMinutes))
    lateStartGraceMinutes = 5
    earlyStopPenaltyMinutes = 10
    allowPause = plannedDurationMinutes >= 60
    maxPauseMinutes = allowPause ? 8 : undefined
    reasons.push('Le deep work exige une durée utile minimale et limite les interruptions.')
    if (plannedDurationMinutes < 30) {
      warnings.push('Ce bloc est trop court pour un deep work crédible; une revue de mode est recommandée.')
      confidence -= 20
    }
  } else if (rescue || intensive) {
    minimumUsefulMinutes = Math.max(Math.min(plannedDurationMinutes, 10), Math.min(minimumUsefulMinutes, plannedDurationMinutes))
    lateStartGraceMinutes = rescue ? 3 : 5
    earlyStopPenaltyMinutes = rescue ? 10 : 8
    allowPause = plannedDurationMinutes >= 25
    maxPauseMinutes = allowPause ? (rescue ? 3 : 5) : undefined
    overtimePolicy = 'deny_overtime'
    reasons.push('Le mode intensif réduit les pauses sans les supprimer lorsque la durée les rend nécessaires.')
  } else if (review) {
    minimumUsefulMinutes = Math.min(plannedDurationMinutes, Math.max(5, Math.min(minimumUsefulMinutes, 15)))
    allowPause = plannedDurationMinutes >= 30
    maxPauseMinutes = allowPause ? 5 : undefined
    overtimePolicy = 'allow_short_overtime'
    reasons.push('Une revue légère garde une politique temporelle souple.')
  }

  maximumSafeMinutes = Math.max(minimumUsefulMinutes, maximumSafeMinutes)
  if (plannedDurationMinutes > maximumSafeMinutes) {
    warnings.push(`La durée prévue dépasse la limite sûre de ${maximumSafeMinutes} minutes.`)
    overtimePolicy = 'deny_overtime'
    allowPause = true
    maxPauseMinutes = Math.max(maxPauseMinutes ?? 0, 10)
    confidence -= 15
  }
  if (placementBlock.start >= placementBlock.end) {
    warnings.push('Les horaires du bloc sont incohérents.')
    confidence = 0
  }

  const day = input.planningContext?.days.find((candidate) => candidate.date === placementBlock.date)
  if (day?.status === 'overloaded' || day?.status === 'no_usable_time') {
    maximumSafeMinutes = Math.min(maximumSafeMinutes, Math.max(30, plannedDurationMinutes))
    overtimePolicy = 'deny_overtime'
    warnings.push('La récupération disponible est limitée; la session ne doit pas dépasser son bloc.')
  }

  minimumUsefulMinutes = Math.min(plannedDurationMinutes, minimumUsefulMinutes)
  return {
    plannedStart: placementBlock.start,
    plannedEnd: placementBlock.end,
    plannedDurationMinutes,
    minimumUsefulMinutes: finiteMinutes(minimumUsefulMinutes),
    maximumSafeMinutes: finiteMinutes(maximumSafeMinutes),
    lateStartGraceMinutes: finiteMinutes(lateStartGraceMinutes),
    earlyStopPenaltyMinutes: finiteMinutes(earlyStopPenaltyMinutes),
    allowPause,
    ...(maxPauseMinutes !== undefined ? { maxPauseMinutes: finiteMinutes(maxPauseMinutes) } : {}),
    overtimePolicy,
    reasons,
    warnings,
    confidence: Math.max(0, Math.min(100, Number.isFinite(confidence) ? confidence : 0)),
  }
}
