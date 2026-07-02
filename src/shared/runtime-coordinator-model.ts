import type { SessionPlanV2, SessionProtectionPlan } from './session-model'

// If a separate ProtectionRuntimePlanV2 doesn't exist yet, we rely directly on SessionProtectionPlan
export type ProtectionRuntimePlanV2 = SessionProtectionPlan

export type BlockingProfileDraft = {
  mode: 'blocklist' | 'allowlist' | 'strict_allowlist' | 'none' | 'manual_review'

  apps: {
    allow: string[]
    block: string[]
    monitorOnly: string[]
    conditional: string[]
  }

  sites: {
    allow: string[]
    block: string[]
    monitorOnly: string[]
    conditional: string[]
  }

  unlockPolicy:
    | 'none'
    | 'cooldown'
    | 'justification'
    | 'cooldown_and_justification'
    | 'deny_during_strict_session'

  overlayBehavior: {
    preferredMethod: 'attached_overlay_existing_system'
    shouldCoverApps: boolean
    shouldAvoidKillProcess: boolean
    allowUserMinimizeFromOverlay: boolean
    allowUserCloseFromOverlay: boolean
  }

  mediaBehavior: {
    shouldMuteDistractingMedia: boolean
    shouldPauseDistractingMedia: boolean
    scope: 'target_app_only'
  }

  recoveryBehavior: {
    shouldPersistActiveSessionLater: boolean
    shouldUseExistingHydrateFromDiskLater: boolean
  }

  reasons: string[]
  warnings: string[]
  confidence: number
}

export type RuntimeSignalBridgePlan = {
  shouldListenToBlockedAttemptLater: boolean
  shouldListenToSessionEndedLater: boolean
  shouldListenToUnlockRequestsLater: boolean

  blockedAttemptSignalMapping: {
    outputSignal: 'distractionAttemptCount'
    sourceEvent: 'blockedAttempt'
  }

  sessionEndedSignalMapping: {
    outputSignal: 'completedNormally' | 'endedEarly' | 'missed'
    sourceEvent: 'sessionEnded'
  }

  unlockSignalMapping: {
    outputSignal: 'unlockRequestCount'
    sourceEvent: 'unlockRequested' | 'justificationSubmitted'
  }

  warnings: string[]
  confidence: number
}

export type RuntimeClosureBridgePlan = {
  shouldTriggerClosureLater: boolean

  closureEngineToUse:
    | 'session-closure-engine'
    | 'session-outcome-engine'
    | 'manual_review'
    | 'none'

  when: 'after_sessionEnded' | 'after_user_stop' | 'after_timer_complete' | 'manual_only'

  shouldApplyOutcomeToTaskStoreNow: boolean

  reasons: string[]
  warnings: string[]
  confidence: number
}

export type RuntimeCoordinatorSafetyReport = {
  status: 'safe' | 'warning' | 'unsafe' | 'critical'
  forbiddenIntegrationDetected: boolean
  doNotTouchFiles: string[]
  riskyTargets: string[]
  warnings: string[]
  confidence: number
}

export type RuntimeCoordinatorExplanation = {
  title: string
  summary: string
  reasons: string[]
  warnings: string[]
}

export type RuntimeCoordinatorDiagnostics = {
  status: 'healthy' | 'warning' | 'critical'
  issues: Array<{
    id: string
    severity: 'low' | 'medium' | 'high' | 'critical'
    message: string
    suggestion?: string
  }>
  summary: string[]
}

export type RuntimeCoordinatorPlanV2 = {
  id: string
  userId: string
  sessionPlanId: string

  mode: 'inactive' | 'ready_for_preview' | 'manual_review_required' | 'unsafe' | 'low_confidence'

  protectionRuntimePlan?: ProtectionRuntimePlanV2
  blockingProfileDraft: BlockingProfileDraft
  signalBridgePlan: RuntimeSignalBridgePlan
  closureBridgePlan: RuntimeClosureBridgePlan
  safety: RuntimeCoordinatorSafetyReport
  explanation: RuntimeCoordinatorExplanation
  diagnostics?: RuntimeCoordinatorDiagnostics

  confidence: number

  metadata: {
    modelVersion: number
    createdAt: string
    updatedAt: string
    source: 'runtime_coordinator'
  }
}
