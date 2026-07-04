export type PlacementTargetType =
  | 'task'
  | 'objective'
  | 'strategy_block'

export type PlacementBlockKind =
  | 'work'
  | 'deep_work'
  | 'short_action'
  | 'review'
  | 'recovery'
  | 'diagnostic'
  | 'practice'
  | 'high_yield'
  | 'summary'
  | 'buffer'
  | 'manual_review'

export type PlacementMode =
  | 'normal'
  | 'deep_work'
  | 'intensive'
  | 'rescue'
  | 'minimum_viable'
  | 'manual_review'

export type PlacementStatus =
  | 'proposed'
  | 'rejected'
  | 'unplaced'
  | 'conflict'
  | 'requires_review'

export type ProposedPlacementBlock = {
  id: string

  targetType: PlacementTargetType
  targetId: string

  kind: PlacementBlockKind

  title: string

  date: string
  start: string
  end: string
  durationMinutes: number

  sourceWindowId: string

  linkedTaskId?: string
  linkedObjectiveId?: string

  placementMode: PlacementMode

  priorityScore?: number
  confidence: number

  locked: false

  reasons: string[]
  warnings: string[]

  metadata?: Record<string, unknown>
}

export type PlacementCandidate = {
  id: string

  targetType: 'task' | 'objective'
  targetId: string
  targetStatus?: string

  title: string

  remainingMinutes: number
  minimumUsefulMinutes: number
  recommendedMinutes: number
  maximumSafeMinutes: number

  requiresDeepWork: boolean
  canSplit: boolean
  canUseShortGap: boolean
  shouldAvoidLateNight: boolean

  deadline?: string

  priorityScore: number
  actionPriorityScore?: number
  planningPriorityScore?: number
  protectionPriorityScore?: number
  recoveryPriorityScore?: number

  urgencyLevel?: 'none' | 'low' | 'medium' | 'high' | 'critical'
  riskLevel?: 'low' | 'medium' | 'high' | 'critical'

  placementModeHint?: PlacementMode

  reasons: string[]
  warnings: string[]

  confidence: number
}

export type PlacementWindowFit = {
  candidateId: string
  windowId: string

  canFit: boolean
  fitScore: number

  proposedDurationMinutes: number

  reasons: string[]
  warnings: string[]
}

export type UnplacedPlacementItem = {
  targetType: 'task' | 'objective'
  targetId: string

  reason:
    | 'no_usable_window'
    | 'needs_deep_work_but_no_deep_window'
    | 'deadline_impossible'
    | 'task_too_large'
    | 'task_too_vague'
    | 'capacity_exceeded'
    | 'recovery_protected'
    | 'sleep_protected'
    | 'manual_review_required'
    | 'low_confidence'
    | 'unknown'

  explanation: string

  suggestedNextAction:
    | 'split_task'
    | 'clarify_task'
    | 'reduce_scope'
    | 'manual_review'
    | 'reschedule_deadline'
    | 'create_smaller_task'
    | 'wait'

  confidence: number
}

export type PlacementDiagnostics = {
  status: 'healthy' | 'warning' | 'critical'
  issues: PlacementDiagnosticIssue[]
  summary: string[]
}

export type PlacementDiagnosticIssue = {
  id: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  message: string
  targetType?: PlacementTargetType
  targetId?: string
  suggestion?: string
}

export type PlacementPlanV2 = {
  userId: string

  dateRange: {
    startDate: string
    endDate: string
  }

  mode: PlacementMode

  proposedBlocks: ProposedPlacementBlock[]
  unplacedItems: UnplacedPlacementItem[]

  usedWindowIds: string[]

  summary: {
    totalProposedMinutes: number
    deepWorkMinutes: number
    shortActionMinutes: number
    rescueMinutes: number
    bufferMinutes: number
    unplacedCount: number
  }

  warnings: string[]

  explanation: {
    title: string
    summary: string
    reasons: string[]
  }

  diagnostics?: PlacementDiagnostics

  confidence: number

  metadata: {
    modelVersion: number
    createdAt: string
    updatedAt: string
    source: 'placement_engine'
  }
}
