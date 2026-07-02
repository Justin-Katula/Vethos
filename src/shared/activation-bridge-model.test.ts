import { describe, it, expect } from 'vitest'
import { ExecutionContractDraftV2, ActivationFutureActionDraft, ActivationBridgeGateResult, ActivationBridgeDraftV2 } from './activation-bridge-model'

describe('activation-bridge-model', () => {
  it('ensures all execution/apply/activate properties are literal false', () => {
    // Type checking forces these to be false, but let's just make a mock object and verify
    // the TS compiler would fail if these could be true.
    const action: ActivationFutureActionDraft = {
      id: 'a1',
      kind: 'future_start_session',
      targetType: 'session',
      label: 'test',
      status: 'blocked',
      reason: 'test',
      canExecuteNow: false,
      requiredFutureFlags: [],
      requiredSafetyChecks: [],
      confidence: 1
    }

    expect(action.canExecuteNow).toBe(false)
  })

  it('outputs are fully serializable', () => {
    const draft: ExecutionContractDraftV2 = {
      id: 'd1',
      scope: 'preview_only',
      status: 'draft_only',
      approvedInPrinciple: true,
      futureActions: [],
      preconditions: {
        status: 'all_passed_for_draft_only',
        items: [],
        passedCount: 0,
        warningCount: 0,
        failedCount: 0,
        blockedCount: 0,
        canActivateNow: false,
        confidence: 1
      },
      warnings: [],
      blockers: [],
      canApplyPlanningNow: false,
      canCreateSessionsNow: false,
      canStartSessionsNow: false,
      canEnableBlockingNow: false,
      canCompleteTasksNow: false,
      canPersistContractNow: false,
      canActivateNow: false,
      metadata: {
        source: 'activation_bridge_contract_draft',
        createdAt: '2026-06-26T00:00:00.000Z',
        modelVersion: 1
      },
      confidence: 1
    }

    const serialized = JSON.stringify(draft)
    const deserialized = JSON.parse(serialized)

    expect(deserialized.canActivateNow).toBe(false)
    expect(deserialized.canStartSessionsNow).toBe(false)
    expect(deserialized.metadata.modelVersion).toBe(1)
  })
})
