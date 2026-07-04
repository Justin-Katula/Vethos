import { describe, it, expect } from 'vitest'
import { runRuntimeCoordinatorDiagnostics } from './runtime-coordinator-diagnostics'
import type { RuntimeCoordinatorPlanV2 } from '@shared/runtime-coordinator-model'

describe('runtime-coordinator-diagnostics', () => {
  const basePlan: Omit<RuntimeCoordinatorPlanV2, 'diagnostics'> = {
    id: 'test',
    userId: 'user',
    sessionPlanId: 'sp1',
    mode: 'ready_for_preview',
    blockingProfileDraft: {
      mode: 'blocklist',
      apps: { allow: [], block: [], monitorOnly: [], conditional: [] },
      sites: { allow: [], block: [], monitorOnly: [], conditional: [] },
      unlockPolicy: 'none',
      overlayBehavior: {
        preferredMethod: 'attached_overlay_existing_system',
        shouldCoverApps: true,
        shouldAvoidKillProcess: true,
        allowUserMinimizeFromOverlay: true,
        allowUserCloseFromOverlay: true,
      },
      mediaBehavior: {
        shouldMuteDistractingMedia: true,
        shouldPauseDistractingMedia: true,
        scope: 'target_app_only',
      },
      recoveryBehavior: {
        shouldPersistActiveSessionLater: true,
        shouldUseExistingHydrateFromDiskLater: true,
      },
      reasons: [],
      warnings: [],
      confidence: 1,
    },
    signalBridgePlan: {
      shouldListenToBlockedAttemptLater: true,
      shouldListenToSessionEndedLater: true,
      shouldListenToUnlockRequestsLater: false,
      blockedAttemptSignalMapping: { outputSignal: 'distractionAttemptCount', sourceEvent: 'blockedAttempt' },
      sessionEndedSignalMapping: { outputSignal: 'completedNormally', sourceEvent: 'sessionEnded' },
      unlockSignalMapping: { outputSignal: 'unlockRequestCount', sourceEvent: 'unlockRequested' },
      warnings: [],
      confidence: 1,
    },
    closureBridgePlan: {
      shouldTriggerClosureLater: true,
      closureEngineToUse: 'session-closure-engine',
      when: 'after_sessionEnded',
      shouldApplyOutcomeToTaskStoreNow: false,
      reasons: [],
      warnings: [],
      confidence: 1,
    },
    safety: {
      status: 'safe',
      forbiddenIntegrationDetected: false,
      doNotTouchFiles: [],
      riskyTargets: [],
      warnings: [],
      confidence: 1,
    },
    recovery: {
      required: false,
      rollbackStrategy: 'none',
      rulesToRestore: [],
      reasons: [],
      warnings: [],
      confidence: 1,
    },
    explanation: { title: 'T', summary: 'S', reasons: [], warnings: [] },
    confidence: 1,
    metadata: { modelVersion: 1, createdAt: '', updatedAt: '', source: 'runtime_coordinator' },
  }

  it('should return healthy for a valid plan', () => {
    const diag = runRuntimeCoordinatorDiagnostics(basePlan)
    expect(diag?.status).toBe('healthy')
    expect(diag?.issues).toHaveLength(0)
  })

  it('should return critical if avoid kill process is false', () => {
    const diag = runRuntimeCoordinatorDiagnostics({
      ...basePlan,
      blockingProfileDraft: {
        ...basePlan.blockingProfileDraft,
        overlayBehavior: {
          ...basePlan.blockingProfileDraft.overlayBehavior,
          shouldAvoidKillProcess: false,
        },
      },
    })
    expect(diag?.status).toBe('critical')
    expect(diag?.issues.some((i) => i.id === 'avoid_kill_false')).toBe(true)
  })

  it('should return warning for empty strict allowlist', () => {
    const diag = runRuntimeCoordinatorDiagnostics({
      ...basePlan,
      blockingProfileDraft: {
        ...basePlan.blockingProfileDraft,
        mode: 'strict_allowlist',
      },
    })
    expect(diag?.status).toBe('warning')
    expect(diag?.issues.some((i) => i.id === 'empty_strict_allowlist')).toBe(true)
  })
})
