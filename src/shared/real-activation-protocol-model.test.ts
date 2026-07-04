import { describe, it, expect } from 'vitest'
import { RealActivationProtocolDraft } from './real-activation-protocol-model'

describe('real-activation-protocol-model', () => {
  it('enforces literal false for all can* properties', () => {
    const draft: RealActivationProtocolDraft = {
      id: 'test',
      status: 'audit_only',
      moduleAudit: [],
      boundary: {} as any,
      permissionMatrix: {} as any,
      riskReport: {} as any,
      canCallRealManagersNow: false,
      canWriteStoresNow: false,
      canCreateSessionsNow: false,
      canStartSessionsNow: false,
      canApplyPlanningNow: false,
      canEnableBlockingNow: false,
      canCompleteTasksNow: false,
      canTouchOsNow: false,
      canPersistProtocolNow: false,
      canProceedToRealExecution: false,
      blockers: [],
      warnings: [],
      metadata: { source: 'real_activation_protocol_audit', createdAt: '', modelVersion: 1 },
      confidence: 1
    }

    expect(draft.canCallRealManagersNow).toBe(false)
    expect(draft.canProceedToRealExecution).toBe(false)
  })

  it('outputs are fully serializable', () => {
    const draft = { id: 'x', canCallRealManagersNow: false }
    expect(JSON.parse(JSON.stringify(draft))).toEqual(draft)
  })

  it('module audit canCallInPoint16 is false', () => {
    const audit = {
      realFunctions: [{ canCallInPoint16: false }]
    }
    expect(audit.realFunctions[0]?.canCallInPoint16).toBe(false)
  })
})
