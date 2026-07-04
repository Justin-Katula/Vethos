import type {
  SessionContract,
  SessionLifecycleProjection,
  SessionLifecycleState,
  SessionPreflightResult,
  SessionProtectionPlan,
} from '@shared/session-model'
import type { SessionTimingResult } from './session-timing-engine'

export interface SessionLifecycleInput {
  preflight: SessionPreflightResult
  timing: SessionTimingResult
  contract: SessionContract
  protection: SessionProtectionPlan
}

export function buildSessionLifecycleProjection(input: SessionLifecycleInput): SessionLifecycleProjection {
  const { preflight, timing } = input
  const criticalBlock = preflight.blockers.some((blocker) =>
    /durée|horaire|introuvable|invalide|incomplet/iu.test(blocker),
  )
  let initialState: SessionLifecycleState
  if (!preflight.canStart) initialState = criticalBlock ? 'invalid' : 'planned'
  else if (preflight.requiredActions.includes('wait_for_planned_time')) initialState = 'planned'
  else initialState = 'ready'

  const allowedTransitions: SessionLifecycleProjection['allowedTransitions'] = [
    { from: 'planned', to: 'ready', reason: 'L’heure prévue est atteinte et le preflight autorise le démarrage.' },
    { from: 'planned', to: 'missed', reason: 'La grâce de retard est dépassée sans démarrage.' },
    { from: 'ready', to: 'active', reason: 'Le runtime a effectivement démarré le timer et la protection.' },
    { from: 'ready', to: 'missed', reason: 'La session prête n’a pas été démarrée dans sa fenêtre.' },
    { from: 'active', to: 'completed', reason: 'Le timer s’est terminé normalement; la clôture reste distincte de la tâche.' },
    { from: 'active', to: 'aborted', reason: 'La session a été arrêtée avant sa fin prévue.' },
  ]
  const liveStates: SessionLifecycleState[] = ['planned', 'ready', 'active', 'completed', 'aborted', 'missed']
  for (const state of liveStates) {
    allowedTransitions.push({
      from: state,
      to: 'invalid',
      reason: 'Un diagnostic critique invalide le contrat ou ses données runtime.',
    })
  }

  const reasons = [
    `Un retard de ${timing.lateStartGraceMinutes} minutes est toléré avant de considérer la session manquée.`,
    `Un arrêt anticipé applique une pénalité de ${timing.earlyStopPenaltyMinutes} minutes.`,
    timing.allowPause
      ? `Une pause est autorisée${timing.maxPauseMinutes !== undefined ? `, limitée à ${timing.maxPauseMinutes} minutes` : ''}.`
      : 'La durée de cette session ne justifie pas de pause.',
    `La politique d’overtime est ${timing.overtimePolicy}.`,
  ]

  return {
    initialState,
    allowedTransitions,
    lateStartGraceMinutes: timing.lateStartGraceMinutes,
    earlyStopPenaltyMinutes: timing.earlyStopPenaltyMinutes,
    allowPause: timing.allowPause,
    ...(timing.maxPauseMinutes !== undefined ? { maxPauseMinutes: timing.maxPauseMinutes } : {}),
    overtimePolicy: timing.overtimePolicy,
    reasons,
  }
}
