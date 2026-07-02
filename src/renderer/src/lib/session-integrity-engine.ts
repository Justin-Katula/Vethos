import type { SessionPlanV2, SessionIntegrityResult } from '@shared/session-model'

export interface SessionIntegrityInput {
  sessionPlan: Pick<SessionPlanV2, 'id' | 'plannedDurationMinutes' | 'mode' | 'protection'>
  runtimeSignals?: {
    activeDurationMinutes?: number
    usefulActivityMinutes?: number
    distractionAttemptCount?: number
    unlockRequestCount?: number
    idleMinutes?: number
    earlyStopped?: boolean
    completedNormally?: boolean
  }
  now?: string
}

export function calculateSessionIntegrity(input: SessionIntegrityInput): SessionIntegrityResult {
  const { sessionPlan, runtimeSignals } = input

  const sessionId = sessionPlan.id
  const plannedDurationMinutes = sessionPlan.plannedDurationMinutes
  const activeDurationMinutes = runtimeSignals?.activeDurationMinutes ?? 0
  const usefulActivityMinutes = runtimeSignals?.usefulActivityMinutes
  const distractionAttemptCount = runtimeSignals?.distractionAttemptCount ?? 0
  const unlockRequestCount = runtimeSignals?.unlockRequestCount ?? 0
  const idleMinutes = runtimeSignals?.idleMinutes ?? 0
  const earlyStopped = runtimeSignals?.earlyStopped ?? false
  const completedNormally = runtimeSignals?.completedNormally ?? false

  let integrityScore = 100
  let suspiciousBehaviorScore = 0
  const reasons: string[] = []
  const warnings: string[] = []
  let confidence = 100
  let sessionCompleted = false

  if (!runtimeSignals) {
    confidence = 0
    integrityScore = 50 // Unknown, default safe middle
    reasons.push("Aucun signal d'exécution fourni. L'intégrité ne peut pas être mesurée avec certitude.")
    return {
      sessionId,
      sessionCompleted: false,
      plannedDurationMinutes,
      activeDurationMinutes: 0,
      integrityScore,
      suspiciousBehaviorScore,
      reasons,
      warnings,
      confidence
    }
  }

  sessionCompleted = completedNormally

  // Base on time
  if (activeDurationMinutes < plannedDurationMinutes * 0.5) {
    integrityScore -= 30
    reasons.push(`Durée active (${activeDurationMinutes}m) très inférieure à la durée prévue (${plannedDurationMinutes}m).`)
  } else if (activeDurationMinutes >= plannedDurationMinutes * 0.9) {
    integrityScore += 10
    reasons.push("La session a presque atteint ou dépassé la durée prévue.")
  }

  // Early stop
  if (earlyStopped && !completedNormally) {
    integrityScore -= 20
    reasons.push("La session a été interrompue prématurément.")
  }

  // Distractions
  if (distractionAttemptCount > 0) {
    suspiciousBehaviorScore += distractionAttemptCount * 5
    integrityScore -= distractionAttemptCount * 2
    reasons.push(`${distractionAttemptCount} tentative(s) de distraction détectée(s).`)
  }

  // Unlocks
  if (unlockRequestCount > 0) {
    suspiciousBehaviorScore += unlockRequestCount * 10
    integrityScore -= unlockRequestCount * 5
    reasons.push(`${unlockRequestCount} demande(s) de déblocage effectuée(s).`)
    
    if (sessionPlan.protection?.mode === 'strict_allowlist') {
      integrityScore -= 20
      warnings.push("Demande de déblocage pendant une session stricte : intégrité fortement impactée.")
    }
  }

  // Idle
  if (idleMinutes > plannedDurationMinutes * 0.3) {
    suspiciousBehaviorScore += 20
    integrityScore -= 30
    warnings.push(`Temps d'inactivité très élevé (${idleMinutes}m).`)
  }

  // Useful activity if we have it
  if (usefulActivityMinutes !== undefined) {
    if (usefulActivityMinutes > activeDurationMinutes * 0.8) {
      integrityScore += 20
      suspiciousBehaviorScore = Math.max(0, suspiciousBehaviorScore - 10)
      reasons.push("L'activité utile confirmée est très élevée.")
    } else if (usefulActivityMinutes < activeDurationMinutes * 0.3) {
      integrityScore -= 40
      suspiciousBehaviorScore += 30
      warnings.push("Très peu d'activité utile détectée par rapport au temps actif.")
    }
  } else {
    confidence -= 20
    reasons.push("Mesure de l'activité utile manquante (baisse de confiance).")
  }

  // Normalize
  integrityScore = Math.max(0, Math.min(100, integrityScore))
  suspiciousBehaviorScore = Math.max(0, Math.min(100, suspiciousBehaviorScore))

  return {
    sessionId,
    sessionCompleted,
    plannedDurationMinutes,
    activeDurationMinutes,
    usefulActivityMinutes,
    distractionAttemptCount,
    unlockRequestCount,
    idleMinutes,
    integrityScore,
    suspiciousBehaviorScore,
    reasons,
    warnings,
    confidence
  }
}
