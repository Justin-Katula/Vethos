import type { PlacementCandidate } from '@shared/placement-model'

export interface AnyFreeTimeWindow {
  id: string
  start: string // ISO date or time
  end: string
  usableDurationMinutes: number
  canHostTask: boolean
  canHostDeepWork: boolean
  isLateNight?: boolean
  windowType: 'normal' | 'short' | 'tiny' | 'recovery_only' | 'preparation_only' | 'unsafe'
}

export interface AnyPlanningContextV2 {
  usableFreeWindows: AnyFreeTimeWindow[]
}

export interface SelectCandidateWindowsInput {
  candidate: PlacementCandidate
  planningContext: AnyPlanningContextV2
  usedWindowIds?: string[]
  now?: string
}

export function selectCandidateWindows(input: SelectCandidateWindowsInput): AnyFreeTimeWindow[] {
  const { candidate, planningContext, usedWindowIds = [], now } = input

  return planningContext.usableFreeWindows.filter((window) => {
    // Basic validations
    if (!window.canHostTask) return false
    if (usedWindowIds.includes(window.id)) return false
    if (window.usableDurationMinutes <= 0) return false

    // Window type exclusions
    if (window.windowType === 'unsafe' || window.windowType === 'preparation_only') {
      return false
    }

    if (window.windowType === 'recovery_only') {
      // Only allow recovery-related candidates
      const isRecovery =
        candidate.reasons.some(r => r.includes('récupération') || r.includes('recovery')) ||
        candidate.placementModeHint === 'manual_review'
      if (!isRecovery) return false
    }

    if (window.windowType === 'tiny') {
      // Tiny windows are generally excluded unless explicit future micro-action logic is added
      // For now, exclude.
      return false
    }

    if (window.windowType === 'short' && !candidate.canUseShortGap) {
      return false
    }

    // Late night exclusion
    if (window.isLateNight && candidate.shouldAvoidLateNight) {
      return false
    }

    // Deadline check
    if (candidate.deadline) {
      // Very basic comparison. Assuming start and deadline are sortable strings (ISO dates).
      if (window.start >= candidate.deadline) {
        return false
      }
    }

    // Deep work preference
    // If it requires deep work, we technically allow non-deep windows if it's an emergency,
    // but the task-fit-engine will penalize them. However, if they are explicitly 'short',
    // they were already filtered out if canUseShortGap is false.
    // So we don't strictly exclude here based on requiresDeepWork unless we want to.
    
    return true
  })
}
