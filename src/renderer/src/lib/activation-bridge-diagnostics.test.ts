import { describe, it, expect } from 'vitest'
import { runActivationBridgeDiagnostics } from './activation-bridge-diagnostics'
import { ExecutionContractDraftV2 } from '../../../shared/activation-bridge-model'

describe('activation-bridge-diagnostics', () => {
  it('detects missing warnings with blockers', () => {
    const draft = {
      futureActions: [],
      canActivateNow: false
    } as any
    const res = runActivationBridgeDiagnostics({ contractDraft: draft, gateResult: { status: 'blocked_by_qa', blockers: ['x'], warnings: [] } as any })
    expect(res.issues.some(i => i.message.includes('bloqueurs sont présents'))).toBe(true)
  })

  it('detects duplicate futureAction ids', () => {
    const draft = {
      futureActions: [{ id: 'a' }, { id: 'a' }],
      canActivateNow: false
    } as any
    const res = runActivationBridgeDiagnostics({ contractDraft: draft })
    expect(res.status).toBe('warning')
    expect(res.issues.some(i => i.message.includes('dupliquée'))).toBe(true)
  })

  it('detects canApplyAnythingNow true in gate result', () => {
    const draft = { futureActions: [] } as any
    const res = runActivationBridgeDiagnostics({ contractDraft: draft, gateResult: { canApplyAnythingNow: true, blockers: [], warnings: [] } as any })
    expect(res.status).toBe('critical')
  })
})
