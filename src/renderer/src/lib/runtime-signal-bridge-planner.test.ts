import { describe, expect, it } from 'vitest'
import { buildRuntimeSignalBridgePlan } from './runtime-signal-bridge-planner'
import { buildBlockingProfileDraftFromSessionProtection } from './session-protection-to-blocking-profile-adapter'
import { sessionPlanFixture } from './session-test-fixtures'

describe('runtime-signal-bridge-planner', () => {
  it('describes the runtime signals without creating listeners', () => {
    const sessionPlan = sessionPlanFixture()
    const plan = buildRuntimeSignalBridgePlan({
      sessionPlan,
      blockingProfileDraft: buildBlockingProfileDraftFromSessionProtection({ sessionPlan }),
    })
    expect(plan.shouldListenToBlockedAttemptLater).toBe(true)
    expect(plan.shouldListenToUnlockRequestsLater).toBe(true)
    expect(plan.sessionEndedSignalMapping.sourceEvent).toBe('sessionEnded')
  })
})
