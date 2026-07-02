export type SessionTargetType =
  | 'task'
  | 'objective'
  | 'strategy_block'

export type SessionMode =
  | 'normal'
  | 'deep_work'
  | 'intensive'
  | 'rescue'
  | 'minimum_viable'
  | 'recovery'
  | 'review'
  | 'manual_review'

export type SessionStartReadiness =
  | 'ready'
  | 'ready_with_warnings'
  | 'blocked_by_missing_data'
  | 'blocked_by_schedule'
  | 'blocked_by_unclear_target'
  | 'blocked_by_low_confidence'
  | 'manual_review_required'

export type SessionLifecycleState =
  | 'planned_shadow'
  | 'ready_shadow'
  | 'active_shadow'
  | 'completed_shadow'
  | 'aborted_shadow'
  | 'missed_shadow'
  | 'invalid_shadow'

export type SessionProtectionMode =
  | 'none'
  | 'blocklist'
  | 'allowlist'
  | 'strict_allowlist'

export type SessionUnlockPolicy =
  | 'none'
  | 'cooldown'
  | 'justification'
  | 'cooldown_and_justification'
  | 'deny_during_strict_session'

export type SessionCompletionPolicy =
  | 'session_only'
  | 'progress_review'
  | 'completion_gate'
  | 'manual_review'

export type SessionPlanV2 = {
  id: string

  userId: string

  sourcePlacementBlockId?: string

  targetType: SessionTargetType
  targetId: string

  linkedTaskId?: string
  linkedObjectiveId?: string

  title: string

  mode: SessionMode

  date: string
  plannedStart: string
  plannedEnd: string
  plannedDurationMinutes: number

  minimumUsefulMinutes: number
  maximumSafeMinutes: number

  contract: SessionContract

  preflight: SessionPreflightResult

  protection: SessionProtectionPlan

  lifecycle: SessionLifecycleProjection

  closure: SessionClosurePlan

  explanation: SessionExplanation

  diagnostics?: SessionDiagnostics

  confidence: number

  metadata: {
    modelVersion: number
    createdAt: string
    updatedAt: string
    source: 'session_engine'
  }
}

export type SessionContract = {
  targetType: SessionTargetType
  targetId: string

  purpose: string

  expectedOutcome?: string

  progressDefinition:
    | 'time_on_task'
    | 'checklist_progress'
    | 'artifact_progress'
    | 'practice_progress'
    | 'review_progress'
    | 'manual_review'
    | 'unknown'

  completionPolicy: SessionCompletionPolicy

  completionCriteria: string[]

  allowedToMarkTaskCompleted: boolean

  requiresClosureReview: boolean

  requiresStrictEvidence: boolean

  reasons: string[]

  confidence: number
}

export type SessionPreflightResult = {
  readiness: SessionStartReadiness

  canStart: boolean

  blockers: string[]
  warnings: string[]
  requiredActions: Array<
    | 'clarify_task'
    | 'choose_apps'
    | 'choose_sites'
    | 'review_deadline'
    | 'split_task'
    | 'manual_review'
    | 'wait_for_planned_time'
  >

  confidence: number
}

export type SessionProtectionPlan = {
  mode: SessionProtectionMode

  protectionLevel: number

  unlockPolicy: SessionUnlockPolicy

  usefulApps: string[]
  usefulSites: string[]

  blockedApps: string[]
  blockedSites: string[]

  conditionalApps: string[]
  conditionalSites: string[]

  shouldUseOverlay: boolean
  shouldMuteDistractingMedia: boolean

  reasons: string[]
  warnings: string[]

  confidence: number
}

export type SessionLifecycleProjection = {
  initialState: SessionLifecycleState

  allowedTransitions: Array<{
    from: SessionLifecycleState
    to: SessionLifecycleState
    reason: string
  }>

  lateStartGraceMinutes: number
  earlyStopPenaltyMinutes: number
  allowPause: boolean
  maxPauseMinutes?: number

  overtimePolicy: 'stop_at_end' | 'allow_short_overtime' | 'ask_before_overtime' | 'deny_overtime'

  reasons: string[]
}

export type SessionClosurePlan = {
  required: boolean

  closurePromptType: 'simple' | 'progress_review' | 'completion_gate' | 'manual_review'

  questions: string[]

  allowedOutcomes:
    | 'no_progress'
    | 'partial_progress'
    | 'confirmed_progress'
    | 'claimed_completed'
    | 'verified_completed'

  requiresSpecificAnswer: boolean

  minimumSpecificityScore: number

  reasons: string[]
}

export type SessionIntegrityResult = {
  sessionId: string

  sessionCompleted: boolean

  plannedDurationMinutes: number
  activeDurationMinutes: number
  usefulActivityMinutes?: number
  distractionAttemptCount?: number
  unlockRequestCount?: number
  idleMinutes?: number

  integrityScore: number

  suspiciousBehaviorScore: number

  reasons: string[]
  warnings: string[]

  confidence: number
}

export type SessionOutcomeV2 = {
  sessionId: string

  outcome:
    | 'no_progress_confirmed'
    | 'partial_progress'
    | 'progress_confirmed'
    | 'completion_claimed'
    | 'completion_verified'
    | 'completion_rejected'
    | 'manual_review_required'

  verifiedProgressMinutes: number

  shouldReduceRemainingMinutes: boolean
  shouldMarkTaskCompleted: boolean

  completionAccepted: boolean

  reasons: string[]
  warnings: string[]

  confidence: number
}

export type SessionExplanation = {
  title: string
  summary: string
  reasons: string[]
  warnings: string[]
}

export type SessionDiagnostics = {
  status: 'healthy' | 'warning' | 'critical'
  issues: SessionDiagnosticIssue[]
  summary: string[]
}

export type SessionDiagnosticIssue = {
  id: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  message: string
  targetId?: string
  suggestion?: string
}
