import type { SessionContract, SessionLifecycleProjection, SessionLifecycleState, SessionPreflightResult, SessionProtectionPlan } from '@shared/session-model'
import type { SessionTimingResult } from './session-timing-engine'

export interface SessionLifecycleInput {
  preflight: SessionPreflightResult
  timing: SessionTimingResult
  contract: SessionContract
  protection: SessionProtectionPlan
}

export function buildSessionLifecycleProjection(input: SessionLifecycleInput): SessionLifecycleProjection {
  const { preflight, timing } = input
  
  let initialState: SessionLifecycleState = 'planned_shadow'
  const allowedTransitions: SessionLifecycleProjection['allowedTransitions'] = []
  const reasons: string[] = []

  if (!preflight.canStart) {
    if (preflight.readiness === 'blocked_by_missing_data' || preflight.readiness === 'blocked_by_unclear_target') {
      initialState = 'invalid_shadow'
      reasons.push("La session est invalide dès le départ en raison de bloqueurs critiques.")
    } else {
      initialState = 'planned_shadow'
    }
  } else if (preflight.readiness === 'ready' || preflight.readiness === 'ready_with_warnings') {
    initialState = 'ready_shadow' // Could be 'planned_shadow' if far in the future, but we project its readiness state
    if (preflight.requiredActions.includes('wait_for_planned_time')) {
      initialState = 'planned_shadow'
    }
  }

  // Transitions
  if (initialState === 'planned_shadow') {
    allowedTransitions.push({ from: 'planned_shadow', to: 'ready_shadow', reason: "L'heure de début est atteinte et les bloqueurs sont levés." })
    allowedTransitions.push({ from: 'planned_shadow', to: 'missed_shadow', reason: "La session a été manquée." })
  }

  allowedTransitions.push({ from: 'ready_shadow', to: 'active_shadow', reason: "L'utilisateur démarre la session." })
  allowedTransitions.push({ from: 'ready_shadow', to: 'missed_shadow', reason: "La session n'a pas été démarrée dans les temps." })
  
  allowedTransitions.push({ from: 'active_shadow', to: 'completed_shadow', reason: "La session s'est terminée normalement (fin du timer ou complétion)." })
  allowedTransitions.push({ from: 'active_shadow', to: 'aborted_shadow', reason: "L'utilisateur a interrompu la session avant la fin." })

  // Anything can become invalid if data corrupts, but we'll stick to main ones.

  return {
    initialState,
    allowedTransitions,
    lateStartGraceMinutes: timing.lateStartGraceMinutes,
    earlyStopPenaltyMinutes: timing.earlyStopPenaltyMinutes,
    allowPause: timing.allowPause,
    maxPauseMinutes: timing.maxPauseMinutes,
    overtimePolicy: timing.overtimePolicy,
    reasons
  }
}
