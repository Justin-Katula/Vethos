export const PLANNING_CONTEXT_V2_MODEL_VERSION = 2

export type TimeInterval = {
  start: string
  end: string
  durationMinutes: number
}

export type PlanningBlockKind =
  | 'sleep'
  | 'school'
  | 'work'
  | 'fixed_activity'
  | 'commute'
  | 'preparation'
  | 'transition'
  | 'recovery'
  | 'meal'
  | 'existing_session'
  | 'blocked'
  | 'free'
  | 'tiny_gap'
  | 'unusable'
  | 'unknown'

export type DayTimelineSegment = {
  id: string
  date: string
  start: string
  end: string
  durationMinutes: number
  kind: PlanningBlockKind
  label: string
  source: 'schedule' | 'sleep_commitment' | 'fixed_activity' | 'rule' | 'session' | 'computed' | 'manual'
  locked: boolean
  metadata?: Record<string, unknown>
}

export type FreeTimeWindow = {
  id: string
  date: string
  start: string
  end: string
  rawDurationMinutes: number
  usableDurationMinutes: number
  windowType: 'tiny' | 'short' | 'normal' | 'deep_work' | 'recovery_only' | 'preparation_only' | 'unsafe' | 'unknown'
  canHostTask: boolean
  canHostDeepWork: boolean
  canHostRecovery: boolean
  reasons: string[]
  confidence: number
}

export type PlanningRuleResult = {
  id: string
  rule:
    | 'tiny_gap_removed'
    | 'pre_school_preparation'
    | 'pre_work_preparation'
    | 'post_school_recovery'
    | 'post_work_recovery'
    | 'pre_sleep_transition'
    | 'sleep_protection'
    | 'daily_capacity_limit'
    | 'fragmentation_detected'
    | 'deep_work_window_detected'
    | 'deadline_crisis_detected'
  applied: boolean
  affectedMinutes: number
  reason: string
}

export type DayAvailabilitySnapshot = {
  date: string
  timeline: DayTimelineSegment[]
  freeWindows: FreeTimeWindow[]
  rawFreeMinutes: number
  usableFreeMinutes: number
  deepWorkMinutes: number
  shortGapMinutes: number
  recoveryMinutes: number
  preparationMinutes: number
  transitionMinutes: number
  tinyGapMinutes: number
  unusableMinutes: number
  status: 'healthy' | 'tight' | 'overloaded' | 'fragmented' | 'no_usable_time' | 'unknown'
  reasons: string[]
  metadata: {
    modelVersion: number
    createdAt: string
    updatedAt: string
  }
}

export type PlanningContextV2 = {
  userId: string
  dateRange: {
    startDate: string
    endDate: string
  }
  days: DayAvailabilitySnapshot[]
  weeklySummary: {
    rawFreeMinutes: number
    usableFreeMinutes: number
    deepWorkMinutes: number
    recoveryMinutes: number
    overloadedDays: number
    noUsableTimeDays: number
  }
  rulesApplied: PlanningRuleResult[]
  confidence: number
  metadata: {
    modelVersion: number
    createdAt: string
    updatedAt: string
    source: 'shadow_planning_context'
  }
}

export type DailyCapacityResult = {
  date: string
  rawFreeMinutes: number
  usableFreeMinutes: number
  maxWorkMinutes: number
  maxDeepWorkMinutes: number
  maxSameObjectiveMinutes: number
  maxTotalProtectedSessionMinutes: number
  capacityStatus: 'healthy' | 'tight' | 'overloaded' | 'recovery_needed' | 'unknown'
  reasons: string[]
  confidence: number
}

export type DeadlineAvailabilityResult = {
  deadline: string
  minutesUntilDeadline: number
  rawFreeMinutesBeforeDeadline: number
  usableFreeMinutesBeforeDeadline: number
  deepWorkMinutesBeforeDeadline: number
  matchingWindowMinutesBeforeDeadline: number
  status: 'enough_time' | 'tight' | 'critical' | 'impossible' | 'overdue' | 'unknown'
  reasons: string[]
  confidence: number
}

export type FreeTimeExplanation = {
  title: string
  summary: string
  reasons: string[]
  warnings: string[]
  confidence: number
  debug?: Record<string, unknown>
}

export type PlanningContextDiagnosticIssue = {
  id: string
  severity: 'info' | 'warning' | 'critical'
  date?: string
  message: string
  metadata?: Record<string, unknown>
}

export type PlanningContextDiagnostics = {
  status: 'healthy' | 'warning' | 'critical'
  issues: PlanningContextDiagnosticIssue[]
  summary: string[]
}

export type PlanningUiDayData = {
  date: string
  rawFreeLabel: string
  usableFreeLabel: string
  deepWorkLabel: string
  recoveryLabel: string
  preparationLabel: string
  transitionLabel: string
  tinyGapLabel: string
  statusLabel: 'healthy' | 'tight' | 'overloaded' | 'fragmented' | 'no_usable_time' | 'unknown'
  mainExplanation: string
  reasons: string[]
  warnings: string[]
}

/**
 * DeadlineCrisisContext — shadow only.
 * Represents the crisis level and recommended strategy for a task or objective
 * approaching a deadline. Never modifies the real planning, sessions, or blocking.
 *
 * feasibilityRatio = requiredIdealMinutes / usableFreeMinutesBeforeDeadline.
 * When usableFreeMinutesBeforeDeadline is 0, feasibilityRatio is set to
 * MAX_FEASIBILITY_RATIO (999) — never Infinity — so that this object remains
 * safely serialisable.
 */
export type DeadlineCrisisContext = {
  targetType: 'task' | 'objective'
  targetId: string

  deadline?: string
  minutesUntilDeadline?: number

  progressPercent: number
  remainingMinutes: number

  rawFreeMinutesBeforeDeadline: number
  usableFreeMinutesBeforeDeadline: number
  deepWorkMinutesBeforeDeadline: number
  matchingWindowMinutesBeforeDeadline: number

  requiredIdealMinutes: number
  requiredMinimumMinutes: number

  /** Capped at MAX_FEASIBILITY_RATIO (999). Never Infinity. */
  feasibilityRatio: number

  crisisLevel:
    | 'none'
    | 'watch'
    | 'tight'
    | 'critical'
    | 'rescue_required'
    | 'impossible_full_completion'

  recommendedMode:
    | 'normal_plan'
    | 'intensive_plan'
    | 'rescue_plan'
    | 'minimum_viable_plan'
    | 'manual_review'

  shouldProtectSleep: boolean
  minimumSleepWarning?: string

  recommendedStrategy: {
    strategyType:
      | 'complete_everything'
      | 'prioritize_high_yield'
      | 'practice_first'
      | 'diagnostic_first'
      | 'minimum_pass_strategy'
      | 'manual_review'

    focus:
      | 'all_material'
      | 'highest_value_material'
      | 'weak_points'
      | 'practice_questions'
      | 'summary_and_memory'
      | 'unknown'

    reasons: string[]
  }

  warnings: string[]
  explanation: string[]
  confidence: number
}
