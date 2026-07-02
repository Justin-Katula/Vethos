import { describe, it, expect } from 'vitest'
import { buildRealActivationProtocolDraft } from './real-activation-protocol-draft-builder'

describe('real-activation-protocol-draft-builder', () => {
  it('builds a draft and enforces all can* flags to be false', () => {
    const boundary = { status: 'defined_for_audit_only', blockers: [], warnings: [], allowedNow: {}, futureBoundaryCandidates: [] } as any
    const permissions = { status: 'draft_only', permissions: [], canActivateNow: false } as any
    const risks = { status: 'low', risks: [], canProceedToRealExecution: false } as any

    const draft = buildRealActivationProtocolDraft({
      moduleAudit: [],
      boundary,
      permissionMatrix: permissions,
      riskReport: risks
    })

    expect(draft.canCallRealManagersNow).toBe(false)
    expect(draft.canWriteStoresNow).toBe(false)
    expect(draft.canCreateSessionsNow).toBe(false)
    expect(draft.canStartSessionsNow).toBe(false)
    expect(draft.canApplyPlanningNow).toBe(false)
    expect(draft.canEnableBlockingNow).toBe(false)
    expect(draft.canCompleteTasksNow).toBe(false)
    expect(draft.canTouchOsNow).toBe(false)
    expect(draft.canPersistProtocolNow).toBe(false)
    expect(draft.canProceedToRealExecution).toBe(false)
  })

  it('collects blockers and status correctly', () => {
    const boundary = { status: 'blocked', blockers: ['Missing something'], warnings: [], allowedNow: {}, futureBoundaryCandidates: [] } as any
    const permissions = { status: 'draft_only', permissions: [], canActivateNow: false } as any
    const risks = { status: 'low', risks: [], canProceedToRealExecution: false } as any

    const draft = buildRealActivationProtocolDraft({
      moduleAudit: [],
      boundary,
      permissionMatrix: permissions,
      riskReport: risks
    })

    expect(draft.status).toBe('blocked_by_missing_boundary')
    expect(draft.blockers).toContain('Missing something')
  })
})
