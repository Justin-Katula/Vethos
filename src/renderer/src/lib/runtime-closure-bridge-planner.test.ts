import { describe, it, expect } from 'vitest'
import { buildRuntimeClosureBridgePlan } from './runtime-closure-bridge-planner'
import type { SessionPlanV2 } from '@shared/session-model'
import type { RuntimeSignalBridgePlan } from '@shared/runtime-coordinator-model'

describe('runtime-closure-bridge-planner', () => {
  it('should plan for outcome engine when completion_gate is used', () => {
    const mockSessionPlan = {
      closure: { required: true, type: 'auto' },
      contract: { completionPolicy: 'completion_gate' },
    } as unknown as SessionPlanV2

    const mockSignalPlan = {} as RuntimeSignalBridgePlan

    const plan = buildRuntimeClosureBridgePlan({
      sessionPlan: mockSessionPlan,
      signalBridgePlan: mockSignalPlan,
    })

    expect(plan.shouldTriggerClosureLater).toBe(true)
    expect(plan.closureEngineToUse).toBe('session-outcome-engine')
    expect(plan.shouldApplyOutcomeToTaskStoreNow).toBe(false)
  })

  it('should plan for manual review when closure type is manual', () => {
    const mockSessionPlan = {
      closure: { required: true, type: 'manual' },
      contract: { completionPolicy: 'manual' },
    } as unknown as SessionPlanV2

    const mockSignalPlan = {} as RuntimeSignalBridgePlan

    const plan = buildRuntimeClosureBridgePlan({
      sessionPlan: mockSessionPlan,
      signalBridgePlan: mockSignalPlan,
    })

    expect(plan.shouldTriggerClosureLater).toBe(true)
    expect(plan.closureEngineToUse).toBe('manual_review')
    expect(plan.when).toBe('manual_only')
    expect(plan.shouldApplyOutcomeToTaskStoreNow).toBe(false)
  })
})
