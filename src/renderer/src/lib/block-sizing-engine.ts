import type { PlacementCandidate, PlacementMode, PlacementWindowFit } from '@shared/placement-model'
import type { AnyFreeTimeWindow } from './placement-window-selector'

export interface CalculateProposedBlockSizeInput {
  candidate: PlacementCandidate
  window: AnyFreeTimeWindow
  fit: PlacementWindowFit
  placementMode: PlacementMode
  dailyCapacity?: unknown
}

export interface ProposedBlockSize {
  durationMinutes: number
  reason: string
  warnings: string[]
}

export function calculateProposedBlockSize(input: CalculateProposedBlockSizeInput): ProposedBlockSize {
  const { candidate, window, fit, placementMode } = input
  const warnings: string[] = []
  
  if (!fit.canFit) {
    return {
      durationMinutes: 0,
      reason: 'Candidat ne rentre pas dans la fenêtre.',
      warnings: ['Fit canFit est false']
    }
  }

  let duration = fit.proposedDurationMinutes // Default from fit engine
  let reason = ''

  // Apply mode rules
  switch (placementMode) {
    case 'manual_review':
      duration = Math.min(20, window.usableDurationMinutes, candidate.remainingMinutes)
      reason = 'Bloc court pour revue ou clarification manuelle.'
      break
      
    case 'minimum_viable':
      // Minimum viable takes the minimum useful minutes, not the full recommended
      duration = Math.max(candidate.minimumUsefulMinutes, Math.min(45, window.usableDurationMinutes, candidate.remainingMinutes))
      reason = 'Plan minimum viable : placement d\'un bloc suffisant mais minimal.'
      if (duration < candidate.recommendedMinutes) {
        warnings.push('Durée inférieure à la recommandation pour s\'adapter au mode survie.')
      }
      break

    case 'rescue':
      // Rescue plan: strategic blocks, maybe a bit longer than minimum but focused
      duration = Math.min(candidate.recommendedMinutes, window.usableDurationMinutes, 60)
      reason = 'Mode rescue : bloc stratégique et concentré.'
      break
      
    case 'intensive':
      // Intensive: use as much window as possible without exceeding safe maximums
      const buffer = Math.max(5, Math.floor(window.usableDurationMinutes * 0.1)) // Leave at least 5-10% buffer
      duration = Math.min(
        window.usableDurationMinutes - buffer, 
        candidate.maximumSafeMinutes, 
        candidate.remainingMinutes
      )
      reason = 'Mode intensif : utilisation maximale de la fenêtre avec marge minimale.'
      break

    case 'normal':
    default:
      // Normal mode: prefer recommended, keep some buffer
      duration = Math.min(candidate.recommendedMinutes, window.usableDurationMinutes)
      
      // If the window is huge and we asked for a lot, try to leave a buffer
      if (duration > 90 && window.usableDurationMinutes - duration < 15) {
        duration = Math.max(90, window.usableDurationMinutes - 15)
        warnings.push('Marge de sécurité ajoutée pour éviter de remplir toute la fenêtre.')
      }
      
      reason = 'Mode normal : durée recommandée appliquée.'
      break
  }

  // Final hard bounds
  duration = Math.max(duration, candidate.minimumUsefulMinutes)
  duration = Math.min(duration, window.usableDurationMinutes)
  duration = Math.min(duration, candidate.maximumSafeMinutes)
  duration = Math.min(duration, candidate.remainingMinutes)

  // Edge case: if after all this duration is 0 but fit was true, we might have an issue
  if (duration <= 0) {
    return {
      durationMinutes: 0,
      reason: 'Impossible de calculer une durée valide.',
      warnings: ['Durée calculée à 0']
    }
  }

  return { durationMinutes: duration, reason, warnings }
}
