import type { SessionIntegrityResult, SessionPlanV2 } from '@shared/session-model'

export interface SessionRuntimeSignals {
  activeDurationMinutes?: number
  usefulActivityMinutes?: number
  distractionAttemptCount?: number
  unlockRequestCount?: number
  idleMinutes?: number
  earlyStopped?: boolean
  completedNormally?: boolean
}

export interface SessionIntegrityInput {
  sessionPlan: Pick<SessionPlanV2, 'id' | 'plannedDurationMinutes' | 'mode' | 'protection'>
  runtimeSignals?: SessionRuntimeSignals
  now?: string
}

function safeNumber(value: number | undefined): number | undefined {
  return value === undefined ? undefined : Number.isFinite(value) ? Math.max(0, value) : 0
}

function clampScore(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0
}

export function calculateSessionIntegrity(input: SessionIntegrityInput): SessionIntegrityResult {
  const { sessionPlan, runtimeSignals } = input
  const plannedDurationMinutes = safeNumber(sessionPlan.plannedDurationMinutes) ?? 0
  const activeDurationMinutes = safeNumber(runtimeSignals?.activeDurationMinutes) ?? 0
  const usefulActivityMinutes = safeNumber(runtimeSignals?.usefulActivityMinutes)
  const distractionAttemptCount = safeNumber(runtimeSignals?.distractionAttemptCount) ?? 0
  const unlockRequestCount = safeNumber(runtimeSignals?.unlockRequestCount) ?? 0
  const idleMinutes = safeNumber(runtimeSignals?.idleMinutes) ?? 0
  const reasons: string[] = []
  const warnings: string[] = []

  if (!runtimeSignals) {
    return {
      sessionId: sessionPlan.id,
      sessionCompleted: false,
      plannedDurationMinutes,
      activeDurationMinutes: 0,
      integrityScore: 35,
      suspiciousBehaviorScore: 0,
      reasons: ['Aucun signal runtime n’est disponible; le score reste prudent et ne prouve aucun travail.'],
      warnings: ['Une clôture manuelle est nécessaire faute de signaux d’exécution.'],
      confidence: 15,
    }
  }

  let integrityScore = 50
  let suspiciousBehaviorScore = 0
  let confidence = 80
  const ratio = plannedDurationMinutes > 0 ? activeDurationMinutes / plannedDurationMinutes : 0
  if (ratio >= 0.9) {
    integrityScore += 25
    reasons.push('La durée active est proche de la durée planifiée.')
  } else if (ratio >= 0.6) {
    integrityScore += 10
    reasons.push('La durée active couvre une part substantielle de la session.')
  } else {
    integrityScore -= 25
    warnings.push('La durée active est nettement inférieure à la durée planifiée.')
  }

  if (usefulActivityMinutes !== undefined) {
    const usefulRatio = activeDurationMinutes > 0 ? usefulActivityMinutes / activeDurationMinutes : 0
    if (usefulRatio >= 0.75) {
      integrityScore += 20
      reasons.push('Une part élevée du temps actif est classée utile.')
    } else if (usefulRatio < 0.3) {
      integrityScore -= 25
      suspiciousBehaviorScore += 20
      warnings.push('La part d’activité utile est faible.')
    }
  } else {
    confidence -= 25
    reasons.push('L’activité utile n’a pas été mesurée; elle n’est pas supposée.')
  }

  if (distractionAttemptCount > 0) {
    integrityScore -= Math.min(30, distractionAttemptCount * 3)
    suspiciousBehaviorScore += Math.min(35, distractionAttemptCount * 6)
    warnings.push(`${distractionAttemptCount} tentative(s) de distraction ont été signalées.`)
  }
  if (unlockRequestCount > 0) {
    integrityScore -= Math.min(35, unlockRequestCount * 7)
    suspiciousBehaviorScore += Math.min(45, unlockRequestCount * 12)
    warnings.push(`${unlockRequestCount} demande(s) de déblocage ont été signalées.`)
    if (sessionPlan.protection.mode === 'strict_allowlist') integrityScore -= 10
  }
  if (plannedDurationMinutes > 0 && idleMinutes / plannedDurationMinutes >= 0.3) {
    integrityScore -= 25
    suspiciousBehaviorScore += 20
    warnings.push('Le temps d’inactivité représente une part importante de la session.')
  }
  if (runtimeSignals.earlyStopped) {
    integrityScore -= 20
    warnings.push('La session a été arrêtée avant son terme.')
  }
  if (runtimeSignals.completedNormally) {
    integrityScore += 10
    reasons.push('Le timer s’est terminé normalement.')
  }

  return {
    sessionId: sessionPlan.id,
    sessionCompleted: runtimeSignals.completedNormally === true,
    plannedDurationMinutes,
    activeDurationMinutes,
    ...(usefulActivityMinutes !== undefined ? { usefulActivityMinutes } : {}),
    distractionAttemptCount,
    unlockRequestCount,
    idleMinutes,
    integrityScore: clampScore(integrityScore),
    suspiciousBehaviorScore: clampScore(suspiciousBehaviorScore),
    reasons,
    warnings,
    confidence: clampScore(confidence),
  }
}
