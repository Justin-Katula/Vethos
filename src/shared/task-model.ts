import type { UnderstandingCategory } from './engine-results'
import type { CompletionGateResult } from './completion-gate'
import type { UnlockPolicy } from './schemas'

export const TASK_MODEL_V2_VERSION = 2

export type TaskPurposeStrength = 'unknown' | 'supporting' | 'important' | 'mission_critical'
export type TaskWorkloadLevel = 'light' | 'normal' | 'heavy' | 'extreme'
export type TaskUrgencyLevel = 'low' | 'medium' | 'high' | 'critical'
export type TaskRiskLevel = 'low' | 'medium' | 'high' | 'critical'
export type TaskProtectionMode = 'blocklist' | 'allowlist'

export type TaskModelV2Flags = {
  newTaskModelControlsDisplay: false
  newTaskModelControlsSorting: false
  newTaskModelControlsPlacement: false
  newTaskModelControlsBlocking: false
}

export const DEFAULT_TASK_MODEL_V2_FLAGS: TaskModelV2Flags = {
  newTaskModelControlsDisplay: false,
  newTaskModelControlsSorting: false,
  newTaskModelControlsPlacement: false,
  newTaskModelControlsBlocking: false,
}

export type TaskIdentity = {
  id: string
  title: string
  status: 'active' | 'queued' | 'completed' | 'expired'
  linkedObjectiveId: string | null
  createdAt: string
}

export type TaskPurpose = {
  label: string
  domain: UnderstandingCategory
  strength: TaskPurposeStrength
  importanceScore: number
  lifeImpactScore: number
  objectiveName?: string
  reasons: string[]
}

export type TaskWorkload = {
  estimatedMinutes: number
  remainingMinutes: number
  completedMinutes: number
  complexity: 'easy' | 'normal' | 'hard' | 'manual' | 'extreme' | 'unknown'
  complexityScore: number
  workloadScore: number
  workloadLevel: TaskWorkloadLevel
  shouldBeSplit: boolean
  suggestedChunkMinutes: number
  reasons: string[]
}

export type TaskUrgency = {
  deadline: string
  deadlineTime?: string
  deadlineImpact: 'recoverable' | 'hard'
  daysUntilDeadline: number
  minutesUntilDeadline: number | null
  usableFreeMinutesBeforeDeadline: number | null
  deadlineRiskRatio: number | null
  urgencyScore: number
  urgencyLevel: TaskUrgencyLevel
  reasons: string[]
}

export type TaskProgressV2 = {
  progressPercent: number
  investedMinutesToday: number
  investedMinutesThisWeek: number
  investedMinutesTotal: number
  momentumScore: number
  stagnationScore: number
  reasons: string[]
}

export type TaskRisk = {
  riskLevel: TaskRiskLevel
  overallRiskScore: number
  deadlineRiskScore: number
  workloadRiskScore: number
  ambiguityRiskScore: number
  avoidanceRiskScore: number
  interruptionRiskScore: number
  reasons: string[]
  warnings: string[]
}

export type TaskSessionProfile = {
  recommendedSessionMinutes: number
  minimumUsefulSessionMinutes: number
  maximumSafeSessionMinutes: number
  shouldUseDeepWorkBlock: boolean
  shouldAskForBreakAfterSession: boolean
  reasons: string[]
}

export type TaskProtectionProfile = {
  recommendedProtectionLevel: number
  mode: TaskProtectionMode
  unlockPolicy: UnlockPolicy
  usefulApps: string[]
  usefulSites: string[]
  distractingApps: string[]
  distractingSites: string[]
  reasons: string[]
  currentBehaviorStillControlsBlocking: true
}

export type TaskAppSiteContext = {
  usefulApps: string[]
  usefulSites: string[]
  distractingApps: string[]
  distractingSites: string[]
  unknownApps: string[]
  unknownSites: string[]
  reasons: string[]
}

export type TaskNextStep =
  | {
      kind: 'start_session' | 'continue_session' | 'finish_task' | 'split_task' | 'clarify_task'
      label: string
      recommendedSessionMinutes: number
      reasons: string[]
    }
  | {
      kind: 'none'
      label: string
      recommendedSessionMinutes?: number
      reasons: string[]
    }

export type TaskExplanationSummary = {
  title: string
  summary: string
  reasons: string[]
  warnings: string[]
}

export type TaskLifecycleStatus = 'queued' | 'active' | 'in_progress' | 'almost_done' | 'completed' | 'expired' | 'at_risk' | 'stalled' | 'overloaded' | 'unclear'

export type TaskModelV2Metadata = {
  version: typeof TASK_MODEL_V2_VERSION
  generatedAt: string
  source: 'task_model_builder' | 'objective_model' | 'coach' | 'existing_task' | 'user_model'
  flags: TaskModelV2Flags
  debug: Record<string, unknown>
}

export type TaskModelV2 = {
  identity: TaskIdentity
  purpose: TaskPurpose
  workload: TaskWorkload
  urgency: TaskUrgency
  progress: TaskProgressV2
  risk: TaskRisk
  session: TaskSessionProfile
  protection: TaskProtectionProfile
  appSiteContext: TaskAppSiteContext
  nextStep: TaskNextStep
  lifecycle?: TaskLifecycleStatus
  completionVerification: CompletionGateResult
  explanation: TaskExplanationSummary
  metadata: TaskModelV2Metadata
}
