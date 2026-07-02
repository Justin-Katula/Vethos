import type { UnlockPolicy } from './schemas'

export const OBJECTIVE_MODEL_V2_VERSION = 2

export type ObjectiveDomain =
  | 'school' | 'work' | 'project' | 'discipline' | 'health'
  | 'finance' | 'future' | 'personal' | 'unknown'
export type ObjectiveMissionImportance = 'unknown' | 'supporting' | 'important' | 'central'
export type ObjectiveCommitmentStrength = 'weak' | 'normal' | 'strong' | 'non_negotiable'
export type ObjectiveLifecycleState = 'active' | 'completed' | 'archived' | 'paused' | 'at_risk' | 'stalled'
export type ObjectiveRiskLevel = 'low' | 'medium' | 'high' | 'critical'
export type ObjectiveProtectionMode = 'blocklist' | 'allowlist'
export type ObjectiveSuggestedAction =
  | 'start_task' | 'create_task' | 'continue_task' | 'review_objective'
  | 'schedule_block' | 'recover_stagnation' | 'rest'

/** Independent kill switches for the real consumers of the living objective model. */
export type ObjectiveModelV2Flags = {
  objectiveModelV2Enabled: boolean
  objectiveRiskEnabled: boolean
  objectiveNextActionEnabled: boolean
  objectiveProtectionEnabled: boolean
  objectiveProgressV2Enabled: boolean
  objectiveExplanationsEnabled: boolean
  objectiveControlsDisplay: boolean
  objectiveControlsTaskQueue: boolean
  objectiveControlsPlanning: boolean
  objectiveControlsBlocking: boolean
}

export const DEFAULT_OBJECTIVE_MODEL_V2_FLAGS: ObjectiveModelV2Flags = {
  objectiveModelV2Enabled: true,
  objectiveRiskEnabled: true,
  objectiveNextActionEnabled: true,
  objectiveProtectionEnabled: true,
  objectiveProgressV2Enabled: true,
  objectiveExplanationsEnabled: true,
  objectiveControlsDisplay: true,
  objectiveControlsTaskQueue: true,
  objectiveControlsPlanning: false,
  objectiveControlsBlocking: false,
}

export type ObjectiveIdentity = {
  objectiveId: string
  title: string
  description?: string
  color: string
  icon?: string
  domain: ObjectiveDomain
  createdAt: string
  updatedAt: string
  /** Compatibility aliases used by Point 1 consumers. */
  id: string
  name: string
}

export type ObjectiveMission = {
  missionStatement: string
  reasonWhy: string | null
  desiredOutcome: string | null
  failureCost: string | null
  successReward: string | null
  declaredImportanceScore: number
  lifeImpactScore: number
  commitmentStrength: ObjectiveCommitmentStrength
  protectedByVethos: boolean
  confidence: number
  reasons: string[]
  /** Compatibility fields. */
  label: string
  domain: ObjectiveDomain
  declaredImportance: ObjectiveMissionImportance
  observedCommitmentScore: number
}

export type ObjectiveStatusV2 = {
  state: ObjectiveLifecycleState
  isCurrentlyProtected: boolean
  lastWorkedAt: string | null
  lastCompletedTaskAt: string | null
  lastSessionAt: string | null
  reasons: string[]
  currentSchemaStatus: 'active' | 'completed'
  isActive: boolean
  isCompleted: boolean
}

export type ObjectiveProgress = {
  progressPercent: number
  completedTaskCount: number
  totalTaskCount: number
  activeTaskCount: number
  queuedTaskCount: number
  expiredTaskCount: number
  estimatedTotalMinutes: number
  remainingTotalMinutes: number
  investedMinutesToday: number
  investedMinutesThisWeek: number
  investedMinutesTotal: number
  progressSource: 'time' | 'tasks' | 'none'
  confidence: number
  momentumScore: number
  stagnationScore: number
  /** Compatibility aliases. */
  linkedTaskCount: number
  remainingMinutes: number
}

export type ObjectiveRisk = {
  riskLevel: ObjectiveRiskLevel
  stagnationScore: number
  avoidanceScore: number
  deadlineRiskScore: number
  overloadRiskScore: number
  noNextActionRisk: number
  reasons: string[]
  warnings: string[]
  updatedAt: string
  /** Compatibility aliases. */
  overallRiskScore: number
  stagnationRiskScore: number
  avoidanceRiskScore: number
  noNextActionRiskScore: number
}

export type ObjectiveProtectionProfile = {
  defaultProtectionLevel: number
  recommendedProtectionLevel: number
  defaultMode: ObjectiveProtectionMode
  unlockPolicy: UnlockPolicy
  protectedApps: string[]
  protectedSites: string[]
  usefulApps: string[]
  usefulSites: string[]
  distractingApps: string[]
  distractingSites: string[]
  reasons: string[]
  confidence: number
  /** Compatibility alias. */
  mode: ObjectiveProtectionMode
}

export type ObjectiveNextAction = {
  activeTaskId: string | null
  nextRecommendedTaskId: string | null
  suggestedActionType: ObjectiveSuggestedAction
  suggestedDurationMinutes: number
  reason: string
  confidence: number
  /** Compatibility fields used by Point 1 consumers. */
  kind: ObjectiveSuggestedAction
  taskId?: string
  label: string
  recommendedSessionMinutes: number
  reasons: string[]
}

export type ObjectiveLinkedTaskSummary = {
  taskId: string
  title: string
  status: 'active' | 'queued' | 'completed' | 'expired'
  priorityScore: number
  remainingMinutes: number
  deadline: string
  isActive: boolean
  isNextRecommended: boolean
  /** Compatibility alias. */
  id: string
}

export type ObjectiveExplanationSummary = {
  title: string
  summary: string
  reasons: string[]
  warnings: string[]
  confidence: number
}

export type ObjectiveMetadataSource =
  | 'existing_objective' | 'onboarding' | 'user_model' | 'coach' | 'objective_model_builder'

export type ObjectiveModelV2Metadata = {
  modelVersion: typeof OBJECTIVE_MODEL_V2_VERSION
  createdAt: string
  updatedAt: string
  source: ObjectiveMetadataSource
  flags: ObjectiveModelV2Flags
  /** Never render this object in end-user UI. */
  debug?: Record<string, unknown>
  /** Compatibility aliases. */
  version: typeof OBJECTIVE_MODEL_V2_VERSION
  generatedAt: string
}

export type ObjectiveModelV2 = {
  identity: ObjectiveIdentity
  mission: ObjectiveMission
  status: ObjectiveStatusV2
  progress: ObjectiveProgress
  risk: ObjectiveRisk
  protection: ObjectiveProtectionProfile
  nextAction: ObjectiveNextAction
  linkedTasks: ObjectiveLinkedTaskSummary[]
  explanation: ObjectiveExplanationSummary
  metadata: ObjectiveModelV2Metadata
}
