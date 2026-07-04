import type {
  DayAvailabilitySnapshot,
  DayTimelineSegment,
  FreeTimeWindow,
  PlanningContextV2,
  PlanningRuleResult,
} from '@shared/planning-time-model'
import { PLANNING_CONTEXT_V2_MODEL_VERSION } from '@shared/planning-time-model'
import type { ScheduleState, Settings } from '@shared/schemas'
import type { UserCognitiveModel, UserModel } from '@shared/user-model'
import { buildDayTimeline } from './day-timeline-builder'
import { calculateDailyCapacity } from './daily-capacity-engine'
import { applyPreparationAndTransitionRules } from './preparation-transition-engine'
import { applyRecoveryProtection } from './recovery-protection-engine'
import { calculateRawFreeTime } from './raw-free-time-engine'
import {
  type ExistingSessionInput,
  type FixedActivityInput,
  type SleepCommitmentInput,
  normalizeScheduleForDate,
} from './schedule-normalizer'
import { calculateUsableFreeWindows } from './usable-free-time-engine'
import {
  enumerateDateRange,
  segmentId,
  splitFreeSegmentWithComputedBlock,
  sumBy,
  totalDurationMinutes,
} from './planning-time-utils'

export type BuildPlanningContextV2Input = {
  userId: string
  dateRange: {
    startDate: string
    endDate: string
  }
  schedule?: ScheduleState | null
  fixedActivities?: FixedActivityInput[]
  sleepCommitments?: SleepCommitmentInput[]
  sessions?: ExistingSessionInput[]
  userModel?: UserModel | null
  cognitiveModel?: UserCognitiveModel | null
  settings?: Settings | null
  now?: Date
}

function freeWindowRuleResults(windows: FreeTimeWindow[]): PlanningRuleResult[] {
  const results: PlanningRuleResult[] = []
  for (const window of windows) {
    if (window.windowType === 'tiny') {
      results.push({
        id: segmentId(['rule', window.id, 'tiny']),
        rule: 'tiny_gap_removed',
        applied: true,
        affectedMinutes: window.rawDurationMinutes,
        reason: 'Créneau minuscule retiré du temps réellement utilisable.',
      })
    }
    if (window.windowType === 'deep_work') {
      results.push({
        id: segmentId(['rule', window.id, 'deep-work']),
        rule: 'deep_work_window_detected',
        applied: true,
        affectedMinutes: window.usableDurationMinutes,
        reason: 'Créneau assez long pour du travail profond.',
      })
    }
  }
  return results
}

function applyRecoverySegmentsToTimeline(
  timeline: DayTimelineSegment[],
  recoverySegments: DayTimelineSegment[],
): DayTimelineSegment[] {
  return recoverySegments.reduce(
    (current, recoverySegment) => splitFreeSegmentWithComputedBlock(current, recoverySegment),
    timeline,
  )
}

function minutesByKind(timeline: DayTimelineSegment[], kinds: DayTimelineSegment['kind'][]): number {
  return timeline
    .filter((segment) => kinds.includes(segment.kind))
    .reduce((sum, segment) => sum + segment.durationMinutes, 0)
}

function inferDayStatus(args: {
  rawFreeMinutes: number
  usableFreeMinutes: number
  deepWorkMinutes: number
  freeWindows: FreeTimeWindow[]
  busyMinutes: number
}): DayAvailabilitySnapshot['status'] {
  if (args.usableFreeMinutes <= 0) return 'no_usable_time'
  if (args.busyMinutes >= 16 * 60 || args.usableFreeMinutes < 60) return 'overloaded'

  const smallWindows = args.freeWindows.filter((window) => ['tiny', 'short'].includes(window.windowType)).length
  if (smallWindows >= 3 && args.deepWorkMinutes < 60 && args.rawFreeMinutes >= 120) return 'fragmented'
  if (args.usableFreeMinutes < 120) return 'tight'
  return 'healthy'
}

function dayReasons(status: DayAvailabilitySnapshot['status'], windows: FreeTimeWindow[]): string[] {
  const reasons: string[] = []
  if (status === 'healthy') reasons.push('La journée contient du temps réellement exploitable.')
  if (status === 'tight') reasons.push('La journée a peu de marge exploitable.')
  if (status === 'overloaded') reasons.push('La journée est déjà très chargée.')
  if (status === 'fragmented') reasons.push('Plusieurs petits trous existent, mais peu de vrais blocs solides.')
  if (status === 'no_usable_time') reasons.push('Aucun créneau ne peut être défendu comme vrai temps de travail.')
  const deepWorkCount = windows.filter((window) => window.canHostDeepWork).length
  if (deepWorkCount > 0) reasons.push(`${deepWorkCount} créneau(x) peuvent accueillir du travail profond.`)
  return reasons
}

function buildDaySnapshot(
  input: BuildPlanningContextV2Input,
  date: string,
  createdAt: string,
  previousDays?: DayAvailabilitySnapshot[],
): {
  day: DayAvailabilitySnapshot
  rulesApplied: PlanningRuleResult[]
} {
  const normalized = normalizeScheduleForDate({
    date,
    schedule: input.schedule,
    fixedActivities: input.fixedActivities,
    sleepCommitments: input.sleepCommitments,
    existingSessions: input.sessions,
    userModel: input.userModel,
    settings: input.settings,
    now: input.now,
  })
  const baseTimeline = buildDayTimeline({ date, normalizedScheduleSegments: normalized, now: input.now })
  const rawFreeTime = calculateRawFreeTime(baseTimeline)
  const usableWindows = calculateUsableFreeWindows({
    date,
    rawFreeWindows: rawFreeTime.rawFreeWindows,
    timeline: baseTimeline,
    userModel: input.userModel,
    now: input.now,
  })
  const preparation = applyPreparationAndTransitionRules({
    timeline: baseTimeline,
    freeWindows: usableWindows,
    userModel: input.userModel,
  })
  const recovery = applyRecoveryProtection({
    timeline: preparation.updatedTimeline,
    freeWindows: preparation.updatedFreeWindows,
    userModel: input.userModel,
    cognitiveModel: input.cognitiveModel,
    settings: input.settings,
    previousDays,
  })
  const timeline = applyRecoverySegmentsToTimeline(preparation.updatedTimeline, recovery.recoverySegments)
  const finalWindows = recovery.updatedFreeWindows

  const rawFreeMinutes = rawFreeTime.rawFreeMinutes
  const usableFreeMinutes = sumBy(finalWindows, (window) => window.usableDurationMinutes)
  const deepWorkMinutes = sumBy(finalWindows.filter((window) => window.canHostDeepWork), (window) => window.usableDurationMinutes)
  const shortGapMinutes = sumBy(finalWindows.filter((window) => window.windowType === 'short'), (window) => window.rawDurationMinutes)
  const tinyGapMinutes = sumBy(finalWindows.filter((window) => window.windowType === 'tiny'), (window) => window.rawDurationMinutes)
  const recoveryMinutes = minutesByKind(timeline, ['recovery'])
  const preparationMinutes = minutesByKind(timeline, ['preparation'])
  const transitionMinutes = minutesByKind(timeline, ['transition'])
  const unusableMinutes = Math.max(0, rawFreeMinutes - usableFreeMinutes)
  const busyMinutes = totalDurationMinutes(timeline.filter((segment) => segment.kind !== 'free'))
  const status = inferDayStatus({
    rawFreeMinutes,
    usableFreeMinutes,
    deepWorkMinutes,
    freeWindows: finalWindows,
    busyMinutes,
  })
  const rulesApplied = [
    ...preparation.rulesApplied,
    ...recovery.rulesApplied,
    ...freeWindowRuleResults(finalWindows),
  ]

  if (status === 'fragmented') {
    rulesApplied.push({
      id: segmentId(['rule', date, 'fragmentation']),
      rule: 'fragmentation_detected',
      applied: true,
      affectedMinutes: rawFreeMinutes,
      reason: 'Journée fragmentée détectée : temps brut présent mais peu de blocs solides.',
    })
  }

  const provisionalDay: DayAvailabilitySnapshot = {
    date,
    timeline,
    freeWindows: finalWindows,
    rawFreeMinutes,
    usableFreeMinutes,
    deepWorkMinutes,
    shortGapMinutes,
    recoveryMinutes,
    preparationMinutes,
    transitionMinutes,
    tinyGapMinutes,
    unusableMinutes,
    status,
    reasons: dayReasons(status, finalWindows),
    metadata: {
      modelVersion: PLANNING_CONTEXT_V2_MODEL_VERSION,
      createdAt,
      updatedAt: createdAt,
    },
  }
  const capacity = calculateDailyCapacity({
    dayAvailability: provisionalDay,
    userModel: input.userModel,
    cognitiveModel: input.cognitiveModel,
  })
  rulesApplied.push({
    id: segmentId(['rule', date, 'capacity']),
    rule: 'daily_capacity_limit',
    applied: true,
    affectedMinutes: Math.max(0, usableFreeMinutes - capacity.maxWorkMinutes),
    reason: 'Vethos garde une marge : tout le temps libre utilisable ne devient pas du travail.',
  })

  return {
    day: {
      ...provisionalDay,
      reasons: [...provisionalDay.reasons, ...capacity.reasons.slice(0, 2)],
    },
    rulesApplied,
  }
}

export function buildPlanningContextV2(input: BuildPlanningContextV2Input): PlanningContextV2 {
  const now = input.now ?? new Date()
  const createdAt = now.toISOString()
  const dates = enumerateDateRange(input.dateRange.startDate, input.dateRange.endDate)
  
  const dayResults: { day: DayAvailabilitySnapshot; rulesApplied: PlanningRuleResult[] }[] = []
  for (const date of dates) {
    const previousDays = dayResults.map((r) => r.day)
    dayResults.push(buildDaySnapshot(input, date, createdAt, previousDays))
  }
  
  const days = dayResults.map((result) => result.day)
  const rulesApplied = dayResults.flatMap((result) => result.rulesApplied)

  const weeklySummary = {
    rawFreeMinutes: sumBy(days, (day) => day.rawFreeMinutes),
    usableFreeMinutes: sumBy(days, (day) => day.usableFreeMinutes),
    deepWorkMinutes: sumBy(days, (day) => day.deepWorkMinutes),
    recoveryMinutes: sumBy(days, (day) => day.recoveryMinutes),
    overloadedDays: days.filter((day) => day.status === 'overloaded').length,
    noUsableTimeDays: days.filter((day) => day.status === 'no_usable_time').length,
  }

  const confidence =
    days.length === 0
      ? 20
      : Math.max(35, Math.min(90, 70 + days.filter((day) => day.timeline.some((segment) => segment.kind === 'sleep')).length * 2))

  return {
    userId: input.userId,
    dateRange: input.dateRange,
    days,
    weeklySummary,
    rulesApplied,
    confidence,
    metadata: {
      modelVersion: PLANNING_CONTEXT_V2_MODEL_VERSION,
      createdAt,
      updatedAt: createdAt,
      source: 'planning_context_builder',
    },
  }
}
