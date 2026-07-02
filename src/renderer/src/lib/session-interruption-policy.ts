import type { SessionPlanV2 } from '@shared/session-model'

export interface SessionInterruptionPolicyInput {
  sessionPlan: Pick<SessionPlanV2, 'mode' | 'plannedDurationMinutes' | 'targetType' | 'protection' | 'contract'>
  userModel?: unknown
  deadlineCrisisContext?: unknown
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
  let confidence = 100

  const isRescue = sessionPlan.mode === 'rescue' || (deadlineCrisisContext as any)?.recommendedMode === 'rescue_plan'
  const isDeepWork = sessionPlan.mode === 'deep_work'
  const isReview = sessionPlan.mode === 'review' || sessionPlan.mode === 'manual_review'
  const duration = sessionPlan.plannedDurationMinutes
  const risk = (userModel as any)?.disciplineRiskLevel
  
  if (isReview) {
    allowEarlyStop = true
    earlyStopPolicy = 'allow'
    allowPause = true
    interruptionSeverity = 'low'
    reasons.push("Session légère. Interruption autorisée avec faible sévérité.")
  } else if (isRescue) {
    allowEarlyStop = false
    earlyStopPolicy = 'deny_if_strict'
    allowPause = false
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
  if (risk === 'high' || risk === 'critical') {
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
