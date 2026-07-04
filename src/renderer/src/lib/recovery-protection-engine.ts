import type { DayAvailabilitySnapshot, DayTimelineSegment, FreeTimeWindow, PlanningRuleResult } from '@shared/planning-time-model'
import type { UserCognitiveModel, UserModel } from '@shared/user-model'
import type { Settings } from '@shared/schemas'
import {
  createComputedSegment,
  findAdjacentSegment,
  intervalStartMinute,
  segmentEndMinute,
  segmentId,
} from './planning-time-utils'

export type ApplyRecoveryProtectionInput = {
  timeline: DayTimelineSegment[]
  freeWindows: FreeTimeWindow[]
  userModel?: UserModel | null
  cognitiveModel?: UserCognitiveModel | null
  settings?: Settings | null
  previousDays?: DayAvailabilitySnapshot[]
}

export type RecoveryProtectionResult = {
  updatedFreeWindows: FreeTimeWindow[]
  recoverySegments: DayTimelineSegment[]
  rulesApplied: PlanningRuleResult[]
}

function fatigueRiskAtMinute(cognitiveModel: UserCognitiveModel | null | undefined, minute: number): number {
  const hour = Math.max(0, Math.min(23, Math.floor(minute / 60)))
  return cognitiveModel?.fatigueRiskByHour.find((entry) => entry.hour === hour)?.risk ?? 0
}

function recoveryRuleForPreviousKind(kind: DayTimelineSegment['kind']): PlanningRuleResult['rule'] | null {
  if (kind === 'school') return 'post_school_recovery'
  if (kind === 'work') return 'post_work_recovery'
  return null
}

export function applyRecoveryProtection(input: ApplyRecoveryProtectionInput): RecoveryProtectionResult {
  void input.settings
  const cognitiveModel = input.cognitiveModel ?? input.userModel?.cognitiveModel ?? null
  const rulesApplied: PlanningRuleResult[] = []
  const recoverySegments: DayTimelineSegment[] = []

  // Check for consecutive days without free time
  let consecutiveDaysCount = 0
  if (input.previousDays) {
    for (let i = input.previousDays.length - 1; i >= 0; i--) {
      if (input.previousDays[i]!.usableFreeMinutes <= 0) {
        consecutiveDaysCount++
      } else {
        break
      }
    }
  }

  if (consecutiveDaysCount >= 2) {
    rulesApplied.push({
      id: segmentId(['rule', input.timeline[0]?.date ?? 'default', 'consecutive-no-free-time-risk']),
      rule: 'consecutive_no_free_time_risk',
      applied: true,
      affectedMinutes: 0,
      reason: `Risque élevé de fatigue : déjà ${consecutiveDaysCount} jours consécutifs sans aucun temps libre utilisable.`,
    })
  }

  const updatedFreeWindows = input.freeWindows.map((window) => {
    const previous = findAdjacentSegment(input.timeline, window, 'previous')
    const startMinute = intervalStartMinute(window)
    let protectedMinutes = 0
    let reason: string | null = null
    let rule: PlanningRuleResult['rule'] | null = null

    if (previous && segmentEndMinute(previous) === startMinute) {
      rule = recoveryRuleForPreviousKind(previous.kind)
      if (rule) {
        protectedMinutes = Math.min(30, window.rawDurationMinutes)
        reason = `Vethos protège ${protectedMinutes} minutes après ${previous.kind === 'school' ? "l'école" : 'le travail'}.`
      } else if (previous.kind === 'existing_session' && previous.durationMinutes >= 90) {
        protectedMinutes = Math.min(15, window.rawDurationMinutes)
        reason = 'Vethos protège une pause après une longue session.'
      }
    }

    const fatigueRisk = fatigueRiskAtMinute(cognitiveModel, startMinute)
    const fatigueReduction = fatigueRisk >= 70 ? Math.ceil(window.usableDurationMinutes * 0.2) : 0
    if (!reason && fatigueReduction > 0) reason = 'Risque de fatigue élevé : Vethos réduit prudemment ce temps utilisable.'

    if (protectedMinutes > 0) {
      recoverySegments.push(
        createComputedSegment({
          date: window.date,
          startMinute,
          endMinute: startMinute + protectedMinutes,
          kind: 'recovery',
          label: 'Récupération protégée',
          idSuffix: window.id,
          metadata: { sourceWindowId: window.id },
        }),
      )
      if (rule) {
        rulesApplied.push({
          id: segmentId(['rule', window.id, rule]),
          rule,
          applied: true,
          affectedMinutes: protectedMinutes,
          reason: reason ?? 'Récupération protégée.',
        })
      }
    }

    const nextUsable = Math.max(0, window.usableDurationMinutes - protectedMinutes - fatigueReduction)
    return {
      ...window,
      windowType: protectedMinutes >= window.rawDurationMinutes ? 'recovery_only' as const : window.windowType,
      usableDurationMinutes: nextUsable,
      canHostTask: nextUsable >= 30,
      canHostDeepWork: nextUsable >= 120,
      canHostRecovery: true,
      reasons: reason ? [...window.reasons, reason] : window.reasons,
      confidence: Math.max(window.confidence, protectedMinutes > 0 ? 86 : window.confidence),
    }
  })

  return { updatedFreeWindows, recoverySegments, rulesApplied }
}
