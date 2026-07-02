export const COMPLETION_GATE_VERSION = 1

export type CompletionOutcomeKind =
  | 'exercises'
  | 'document'
  | 'code'
  | 'submission'
  | 'study_summary'
  | 'custom'
  | 'unknown'

export type CompletionProgressClaim = 'none' | 'some' | 'much' | 'completed'

export type CompletionGateDecision =
  | 'reject_completion'
  | 'accept_partial_progress'
  | 'accept_progress'
  | 'accept_completion'
  | 'require_review'

export type CompletionVerificationStatus =
  | 'not_requested'
  | 'claim_pending'
  | 'verified'
  | 'rejected_insufficient_evidence'
  | 'partial_progress'
  | 'manual_review_required'

export type CompletionContract = {
  taskId: string
  outcomeKind: CompletionOutcomeKind
  expectedOutcome: string
  acceptanceCriteria: string[]
  requiredEvidenceScoreOverride?: number
  createdAt?: string
}

export type CompletionClaim = {
  userClaimedCompleted: boolean
  progressClaim: CompletionProgressClaim
  summary?: string
  claimedAt?: string
}

export type CompletionSessionEvidence = {
  sessionId?: string
  durationMinutes: number
  plannedMinutes?: number
  usefulActivityMinutes?: number
  allowedActivityMinutes?: number
  idleMinutes?: number
  distractingAttempts?: number
  unlockRequests?: number
  blockedAppAttempts?: number
  blockedSiteAttempts?: number
  earlyStop?: boolean
  endedNormally?: boolean
  strictMode?: boolean
  usefulAppsUsed?: string[]
  usefulSitesUsed?: string[]
}

export type WorkEvidence = {
  kind:
    | 'session_integrity'
    | 'specific_completion_summary'
    | 'criteria_match'
    | 'useful_activity'
    | 'user_history'
    | 'completion_contract'
  label: string
  score: number
  source: 'session' | 'user_claim' | 'user_model' | 'contract' | 'shadow_engine'
}

export type WorkPenalty = {
  kind:
    | 'vague_claim'
    | 'early_stop'
    | 'unlock_request'
    | 'distraction_attempt'
    | 'low_useful_activity'
    | 'too_fast_for_task'
  label: string
  score: number
  source: 'session' | 'user_claim' | 'shadow_engine'
}

export type CompletionGateResult = {
  taskId: string
  sessionId?: string
  userClaimedCompleted: boolean
  verifiedCompleted: boolean
  verificationStatus: CompletionVerificationStatus
  decision: CompletionGateDecision
  evidenceScore: number
  userTrustWeight: number
  requiredEvidenceScore: number
  sessionIntegrityScore: number
  completionSpecificityScore: number
  criteriaMatchScore: number
  suspiciousBehaviorScore: number
  integrityRiskScore: number
  finalConfidence: number
  verifiedProgressMinutes: number
  evidence: WorkEvidence[]
  penalties: WorkPenalty[]
  reasons: string[]
  warnings: string[]
  lastClaimedAt?: string
  verifiedAt?: string
  metadata: {
    version: typeof COMPLETION_GATE_VERSION
    shadowOnly: boolean
    generatedAt: string
    source: 'completion_gate_shadow_engine'
    debug: Record<string, unknown>
  }
}
