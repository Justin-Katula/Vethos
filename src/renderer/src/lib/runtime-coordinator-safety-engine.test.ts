import { describe, it, expect } from 'vitest'
import { runRuntimeCoordinatorSafetyCheck } from './runtime-coordinator-safety-engine'
import type { SessionPlanV2 } from '@shared/session-model'
import type { BlockingProfileDraft } from '@shared/runtime-coordinator-model'

describe('runtime-coordinator-safety-engine', () => {
  const baseProfile: BlockingProfileDraft = {
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
  }

  const baseSession = {} as SessionPlanV2

  it('should be safe if no restricted targets are provided', () => {
    const report = runRuntimeCoordinatorSafetyCheck({
      sessionPlan: baseSession,
      blockingProfileDraft: baseProfile,
    })
    expect(report.status).toBe('safe')
    expect(report.riskyTargets).toHaveLength(0)
  })

  it('should be critical if Vethos process is blocked', () => {
    const report = runRuntimeCoordinatorSafetyCheck({
      sessionPlan: baseSession,
      blockingProfileDraft: {
        ...baseProfile,
        apps: { ...baseProfile.apps, block: ['vethos.exe'] },
      },
    })
    expect(report.status).toBe('critical')
    expect(report.riskyTargets).toContain('vethos.exe')
  })

  it('should be critical if system process is blocked', () => {
    const report = runRuntimeCoordinatorSafetyCheck({
      sessionPlan: baseSession,
      blockingProfileDraft: {
        ...baseProfile,
        apps: { ...baseProfile.apps, block: ['explorer.exe'] },
      },
    })
    expect(report.status).toBe('critical')
    expect(report.riskyTargets).toContain('explorer.exe')
  })

  it('should be warning if strict allowlist has no allowed apps', () => {
    const report = runRuntimeCoordinatorSafetyCheck({
      sessionPlan: baseSession,
      blockingProfileDraft: {
        ...baseProfile,
        mode: 'strict_allowlist',
      },
    })
    expect(report.status).toBe('warning')
  })

  it('should be critical if kill process is requested', () => {
    const report = runRuntimeCoordinatorSafetyCheck({
      sessionPlan: baseSession,
      blockingProfileDraft: {
        ...baseProfile,
        overlayBehavior: {
          ...baseProfile.overlayBehavior,
          shouldAvoidKillProcess: false,
        },
      },
    })
    expect(report.status).toBe('critical')
  })
})
