import { describe, it, expect } from 'vitest'
import { buildRealActivationViewModel } from './real-activation-view-model'

describe('real-activation-view-model', () => {
  it('aggregates sub-engines and strictly enforces false flag values', () => {
    const mockDraft = {
      status: 'audit_only',
      boundary: { status: 'defined_for_audit_only', futureBoundaryCandidates: [] },
      permissionMatrix: { permissions: [] },
      riskReport: { risks: [] },
      canProceedToRealExecution: false,
      blockers: []
    } as any

    const model = buildRealActivationViewModel({ protocolDraft: mockDraft })
    expect(model.canProceedToRealExecution).toBe(false)
    expect(model.canCallRealManagersNow).toBe(false)
    expect(model.readiness).toBeDefined()
    expect(model.diagnostics).toBeDefined()
    expect(model.explanation).toBeDefined()
  })
})
