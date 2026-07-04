import type { PlacementCandidate, PlacementWindowFit } from '@shared/placement-model'
import type { AnyFreeTimeWindow } from './placement-window-selector'

export interface CalculateWindowFitInput {
  candidate: PlacementCandidate
  window: AnyFreeTimeWindow
  dailyCapacity?: unknown
  deadlineCrisisContext?: unknown
  now?: string
}

export function calculateWindowFit(input: CalculateWindowFitInput): PlacementWindowFit {
  const { candidate, window } = input
  
  const reasons: string[] = []
  const warnings: string[] = []
  
  let canFit = true
  let fitScore = 50
  
  // Hard limits
  if (window.usableDurationMinutes < candidate.minimumUsefulMinutes) {
    canFit = false
    reasons.push('Fenêtre trop courte par rapport au minimum utile.')
  }
  
  if (candidate.remainingMinutes <= 0) {
    canFit = false
    reasons.push('Plus de temps restant nécessaire.')
  }
  
  if (candidate.deadline && window.start >= candidate.deadline) {
    canFit = false
    reasons.push('Fenêtre située après la deadline.')
  }

  if (candidate.requiresDeepWork && !window.canHostDeepWork) {
    // According to spec: "canFit=false ou fitScore très faible"
    // Let's make it false unless it's a manual_review or clarification
    if (candidate.placementModeHint === 'manual_review') {
      fitScore -= 40
      warnings.push('Deep work demandé, mais la fenêtre ne le permet pas idéalement.')
    } else {
      canFit = false
      reasons.push('Deep work requis mais fenêtre non compatible.')
    }
  }

  // Calculate proposed duration
  let proposedDurationMinutes = 0
  if (canFit) {
    const isAlmostDone = (candidate.reasons || []).some(r => r.includes('presque terminée'))
    if (isAlmostDone) {
      proposedDurationMinutes = Math.min(candidate.remainingMinutes, window.usableDurationMinutes)
    } else {
      // By default try to place recommended minutes, bounded by what's available and what's safe
      proposedDurationMinutes = Math.min(
        candidate.recommendedMinutes,
        window.usableDurationMinutes,
        candidate.maximumSafeMinutes
      )
    }

    if (proposedDurationMinutes < candidate.minimumUsefulMinutes) {
      canFit = false
      reasons.push('La durée proposée est inférieure au minimum utile.')
    }
  }

  // If we can still fit, calculate fit score
  if (canFit) {
    // Positive factors
    if (window.usableDurationMinutes >= candidate.recommendedMinutes) {
      fitScore += 20
      reasons.push('Excellente durée disponible.')
    } else if (window.usableDurationMinutes >= candidate.minimumUsefulMinutes) {
      fitScore += 10
      reasons.push('Durée suffisante.')
    }

    if (candidate.requiresDeepWork && window.canHostDeepWork) {
      fitScore += 15
      reasons.push('Fenêtre idéale pour du travail profond.')
    }

    if (candidate.deadline) {
      fitScore += 10
      reasons.push('Fenêtre utile avant la deadline.')
    }

    fitScore += (candidate.priorityScore / 100) * 15

    // Negative factors
    if (window.windowType === 'short') {
      fitScore -= 10
      warnings.push('Fenêtre courte, peut nécessiter une transition rapide.')
    }

    if (window.isLateNight) {
      fitScore -= 20
      warnings.push('Fenêtre tardive, potentielle fatigue.')
    }
  } else {
    fitScore = 0
    proposedDurationMinutes = 0
  }

  // Clamp score
  fitScore = Math.max(0, Math.min(100, fitScore))

  return {
    candidateId: candidate.id,
    windowId: window.id,
    canFit,
    fitScore,
    proposedDurationMinutes,
    reasons,
    warnings
  }
}
