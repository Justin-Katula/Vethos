import type { UnlockPolicy } from './schemas'

export type EngineTargetType =
  | 'task'
  | 'objective'
  | 'planning_block'
  | 'session'
  | 'app'
  | 'site'

export type EngineConfidence = number

export type EngineReasonTag =
  | 'deadline_soon'
  | 'deadline_today'
  | 'deadline_overdue'
  | 'large_remaining_work'
  | 'high_complexity'
  | 'low_progress'
  | 'almost_completed'
  | 'linked_to_objective'
  | 'objective_high_level'
  | 'high_objective_value'
  | 'good_time_slot'
  | 'poor_time_slot'
  | 'limited_free_time'
  | 'recently_ignored'
  | 'stagnating'
  | 'momentum_detected'
  | 'good_cognitive_window'
  | 'session_active'
  | 'blocking_required'
  | 'allowed_for_task'
  | 'blocked_as_distraction'
  | 'sleep_transition'
  | 'rest_protected'
  | 'work_or_school_preparation'
  | 'active_objective'
  | 'large_objective_scope'
  | 'useful_for_task'
  | 'not_required_for_session'
  | 'allowlist_missing'
  | 'protection_strong'
  | 'media_control_required'

export type ExplanationResult = {
  targetType: EngineTargetType
  targetId?: string
  reasonTags: EngineReasonTag[]
  humanTitle: string
  humanReasons: string[]
  severity: 'low' | 'medium' | 'high' | 'critical'
  confidence: EngineConfidence
  debug?: Record<string, unknown>
}

export type PriorityResult = {
  kind: 'task' | 'objective'
  targetId: string
  priorityScore: number
  urgencyScore: number
  valueScore: number
  workloadScore: number
  complexityScore: number
  stagnationScore: number
  momentumScore: number
  reasonTags: EngineReasonTag[]
  humanReasons: string[]
  confidence: EngineConfidence
  debug: Record<string, unknown>
}

export type UnderstandingCategory =
  | 'school'
  | 'work'
  | 'project'
  | 'health'
  | 'discipline'
  | 'finance'
  | 'personal'
  | 'maintenance'
  | 'unknown'

export type UnderstandingResult = {
  targetType: 'task' | 'objective'
  targetId: string
  category: UnderstandingCategory
  importanceGuess: number
  lifeImpactGuess: number
  protectionNeedGuess: number
  usefulAppsGuess: string[]
  usefulSitesGuess: string[]
  confidence: EngineConfidence
  reasons: string[]
  debug?: Record<string, unknown>
}

export type PlacementResult = {
  blockId: string
  blockStart: string
  blockEnd: string
  durationMinutes: number
  placementQuality: 'excellent' | 'good' | 'acceptable' | 'poor' | 'impossible'
  placementScore: number
  reasons: string[]
  warnings: string[]
  debug?: Record<string, unknown>
}

export type SessionPlan = {
  targetType: 'task' | 'objective' | 'session'
  targetId?: string
  durationMinutes: number
  protectionLevel: number
  mode: 'blocklist' | 'allowlist'
  allowedApps: string[]
  allowedSites: string[]
  blockedApps: string[]
  blockedSites: string[]
  unlockPolicy: UnlockPolicy
  reasons: string[]
  confidence: EngineConfidence
  debug?: Record<string, unknown>
}

export type ProtectionLayer =
  | 'hosts'
  | 'process_watcher'
  | 'firewall'
  | 'overlay'
  | 'media_control'
  | 'service_recovery'

export type ProtectionResult = {
  applied: boolean
  appliedLayers: ProtectionLayer[]
  failedLayers: ProtectionLayer[]
  blockedApps: string[]
  blockedSites: string[]
  allowedApps: string[]
  allowedSites: string[]
  warnings: string[]
  debug?: Record<string, unknown>
}

export type LearningUpdate = {
  source: 'session' | 'usage_event' | 'unlock_request' | 'manual_correction'
  targetType?: 'task' | 'objective' | 'app' | 'site'
  targetId?: string
  objectiveImportanceAdjustment?: number
  taskEstimateAdjustment?: number
  appClassificationAdjustment?: number
  siteClassificationAdjustment?: number
  userPreferenceAdjustment?: number
  confidenceChange?: number
  reasons: string[]
  createdAt: string
  debug?: Record<string, unknown>
}

export type DecisionLogEntry = {
  id: string
  createdAt: string
  type:
    | 'task_priority'
    | 'objective_priority'
    | 'placement'
    | 'session_plan'
    | 'blocking'
    | 'unlock_request'
    | 'learning_signal'
  targetType?: EngineTargetType
  targetId?: string
  explanation?: ExplanationResult
  priorityResult?: PriorityResult
  placementResult?: PlacementResult
  sessionPlan?: SessionPlan
  protectionResult?: ProtectionResult
  learningUpdate?: LearningUpdate
  debug?: Record<string, unknown>
}

export type EngineFlags = {
  decisionExplanationEnabled: boolean
  priorityResultEnabled: boolean
  understandingResultEnabled: boolean
  placementResultEnabled: boolean
  sessionPlanEnabled: boolean
  protectionAuditEnabled: boolean
  learningUpdateEnabled: boolean
  decisionLogEnabled: boolean
  newPriorityControlsDisplay: boolean
  newPriorityControlsSorting: boolean
  newPriorityControlsPlacement: boolean
  newSessionPlanControlsBlocking: boolean
  /** Le completion-gate V2 propose réellement la complétion des tâches. */
  newCompletionGateControlsTaskStatus: boolean
  /** Le pipeline execution-preview peut déclencher des actions réelles. */
  newExecutionPreviewControlsApplication: boolean
}

/**
 * Moteurs V2 activés par défaut. Les décisions réelles gardent un fallback V1
 * via withV1Fallback lorsqu'un résultat V2 est invalide ou lève une erreur.
 */
export const DEFAULT_ENGINE_FLAGS: EngineFlags = {
  decisionExplanationEnabled: true,
  priorityResultEnabled: true,
  understandingResultEnabled: true,
  placementResultEnabled: true,
  sessionPlanEnabled: true,
  protectionAuditEnabled: true,
  learningUpdateEnabled: true,
  decisionLogEnabled: true,
  newPriorityControlsDisplay: true,
  newPriorityControlsSorting: true,
  newPriorityControlsPlacement: true,
  newSessionPlanControlsBlocking: true,
  newCompletionGateControlsTaskStatus: true,
  newExecutionPreviewControlsApplication: true,
}
