export type ManualReviewStatus =
  | 'not_started'
  | 'in_review'
  | 'approved_in_principle'
  | 'rejected'
  | 'changes_requested'
  | 'needs_clarification'
  | 'blocked_by_safety'
  | 'invalid'

export type ManualReviewDecisionKind =
  | 'approve_preview_in_principle'
  | 'reject_preview'
  | 'request_changes'
  | 'mark_day_needs_review'
  | 'mark_block_accepted'
  | 'mark_block_needs_review'
  | 'mark_block_rejected'
  | 'request_clarification'
  | 'clear_local_review'

export type ManualReviewSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical'

export interface ManualReviewBlockDecision {
  blockId: string
  decision: 'accepted_in_principle' | 'needs_review' | 'rejected' | 'needs_clarification' | 'undecided'
  reason?: string
  createdAt: string
}

export interface ManualReviewDayDecision {
  date: string
  decision: 'accepted_in_principle' | 'needs_review' | 'rejected' | 'needs_clarification' | 'undecided'
  reason?: string
  createdAt: string
}

export interface ManualReviewDecisionV2 {
  id: string
  kind: ManualReviewDecisionKind
  previewPlanId?: string
  qaReportId?: string
  targetType: 'preview' | 'day' | 'block' | 'qa' | 'safety' | 'readiness'
  targetId?: string
  decision: 'accepted_in_principle' | 'rejected' | 'changes_requested' | 'needs_review' | 'needs_clarification' | 'cleared'
  reason?: string
  createdAt: string
  source: 'manual_review_ui'
  /** Type littéral false (Point 14) : une décision de review n'applique jamais rien. */
  canApplyDecision: false
}

export interface ManualReviewDraftV2 {
  id: string
  previewPlanId?: string
  qaReportId?: string
  status: ManualReviewStatus
  previewDecision: 'accepted_in_principle' | 'rejected' | 'changes_requested' | 'needs_clarification' | 'undecided'
  dayDecisions: ManualReviewDayDecision[]
  blockDecisions: ManualReviewBlockDecision[]
  decisions: ManualReviewDecisionV2[]
  warnings: string[]
  blockers: string[]
  
  // Tous types littéraux false (Point 14) : une approbation en principe ne donne
  // jamais le droit d'appliquer quoi que ce soit. Pas des booléens variables.
  canCreateSessions: false
  canStartSessions: false
  canApplyPlanning: false
  canApplyBlocking: false
  canCompleteTasks: false
  canPersistReview: false
  canProceedToActivationBridge: false
  
  confidence: number
  metadata: {
    source: 'manual_review_gate'
    createdAt: string
    updatedAt: string
    modelVersion: number
  }
}

export interface ManualReviewGateResult {
  status: 'review_allowed' | 'review_allowed_with_warnings' | 'review_blocked' | 'safety_blocked' | 'invalid'
  reviewDraft: ManualReviewDraftV2
  
  canProceedToActivationBridge: false
  canApplyAnything: false
  
  blockers: string[]
  warnings: string[]
  nextRecommendedAction: 'keep_reviewing' | 'request_changes' | 'fix_preview_first' | 'fix_qa_first' | 'do_not_apply' | 'debug_only'
  confidence: number
}

export interface ManualReviewDiagnostics {
  status: 'healthy' | 'warning' | 'critical'
  issues: Array<{
    id: string
    severity: ManualReviewSeverity
    message: string
    suggestion?: string
  }>
  summary: string[]
}

export interface ManualReviewExplanation {
  title: string
  summary: string
  keyPoints: string[]
  warnings: string[]
  nextRecommendedAction: 'continue_review' | 'request_changes' | 'reject_preview' | 'debug_only' | 'do_not_apply'
  confidence: number
}
