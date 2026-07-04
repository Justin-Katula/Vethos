import type { SessionPlanV2 } from '@shared/session-model'
import type { DeadlineCrisisContext } from '@shared/planning-time-model'
import type { UserModel } from '@shared/user-model'

export interface SessionInterruptionPolicyInput {
  sessionPlan: Pick<SessionPlanV2, 'mode' | 'plannedDurationMinutes' | 'targetType' | 'protection' | 'contract'>
  userModel?: UserModel | { disciplineRiskLevel?: 'low' | 'medium' | 'high' | 'critical' } | null
  deadlineCrisisContext?: DeadlineCrisisContext
}

export interface SessionInterruptionPolicyResult {
  allowEarlyStop: boolean
  earlyStopPolicy: 'allow' | 'cooldown' | 'justification' | 'cooldown_and_justification' | 'deny_if_strict'
  allowPause: boolean
  maxPauseMinutes?: number
  interruptionSeverity: 'low' | 'medium' | 'high' | 'critical'
  reasons: string[]
  warnings: string[]
  confidence: number
}

export function buildSessionInterruptionPolicy(input: SessionInterruptionPolicyInput): SessionInterruptionPolicyResult {
  const { sessionPlan, userModel, deadlineCrisisContext } = input
  
  let allowEarlyStop = true
  let earlyStopPolicy: SessionInterruptionPolicyResult['earlyStopPolicy'] = 'allow'
  let allowPause = true
  let maxPauseMinutes: number | undefined = undefined
  let interruptionSeverity: SessionInterruptionPolicyResult['interruptionSeverity'] = 'low'
  const reasons: string[] = []
  const warnings: string[] = []
  const confidence = 100

  const isRescue = sessionPlan.mode === 'rescue' || deadlineCrisisContext?.recommendedMode === 'rescue_plan'
  const isCritical = deadlineCrisisContext?.crisisLevel === 'critical' || deadlineCrisisContext?.crisisLevel === 'rescue_required'
  const isDeepWork = sessionPlan.mode === 'deep_work'
  const isReview = sessionPlan.mode === 'review' || sessionPlan.mode === 'manual_review'
  const duration = sessionPlan.plannedDurationMinutes
  const risk = userModel && 'disciplineModel' in userModel
    ? userModel.disciplineModel.globalDistractionRisk
    : userModel?.disciplineRiskLevel === 'critical' ? 90 : userModel?.disciplineRiskLevel === 'high' ? 70 : 0
  
  if (isReview) {
    allowEarlyStop = true
    earlyStopPolicy = 'allow'
    allowPause = true
    interruptionSeverity = 'low'
    reasons.push("Session légère. Interruption autorisée avec faible sévérité.")
  } else if (isRescue || isCritical) {
    allowEarlyStop = false
    earlyStopPolicy = 'deny_if_strict'
    allowPause = duration >= 25
    maxPauseMinutes = allowPause ? Math.min(3, Math.max(1, Math.floor(duration / 20))) : undefined
    interruptionSeverity = 'critical'
    reasons.push("Session de sauvetage. Les interruptions sont critiques et découragées.")
  } else if (isDeepWork) {
    allowEarlyStop = false
    earlyStopPolicy = 'cooldown_and_justification'
    allowPause = duration > 60
    maxPauseMinutes = allowPause ? 10 : undefined
    interruptionSeverity = 'high'
    reasons.push("Deep work : interruptions fortement pénalisées pour préserver la concentration.")
  } else {
    // Normal
    allowEarlyStop = true
    earlyStopPolicy = 'justification'
    allowPause = duration >= 45
    maxPauseMinutes = allowPause ? 5 : undefined
    interruptionSeverity = 'medium'
  }

  // Adjust for user model
  if (risk >= 60) {
    if (earlyStopPolicy === 'allow') earlyStopPolicy = 'justification'
    if (earlyStopPolicy === 'justification') earlyStopPolicy = 'cooldown_and_justification'
    if (interruptionSeverity === 'low') interruptionSeverity = 'medium'
    else if (interruptionSeverity === 'medium') interruptionSeverity = 'high'
    reasons.push("Risque disciplinaire élevé : politique d'interruption durcie.")
  }

  return {
    allowEarlyStop,
    earlyStopPolicy,
    allowPause,
    maxPauseMinutes,
    interruptionSeverity,
    reasons,
    warnings,
    confidence
  }
}
