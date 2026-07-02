import { describe, it, expect } from 'vitest'
import { runRealActivationDiagnostics } from './real-activation-diagnostics'

describe('real-activation-diagnostics', () => {
  it('identifies permission breaches as critical status', () => {
    const mockDraft = {
      boundary: { status: 'defined_for_audit_only', futureBoundaryCandidates: [] },
      permissionMatrix: {
        permissions: [
          { id: 'perm1', grantedNow: true }
        ]
      }
    } as any

    const diagnostics = runRealActivationDiagnostics({ protocolDraft: mockDraft })
    expect(diagnostics.status).toBe('critical')
    expect(diagnostics.issues.some(i => i.id === 'diag-permission-breach')).toBe(true)
  })

  it('reports healthy when no critical issues exist', () => {
    const mockDraft = {
      boundary: { status: 'defined_for_audit_only', futureBoundaryCandidates: [] },
      permissionMatrix: {
        permissions: [
          { id: 'perm1', grantedNow: false, canRequestNow: false }
        ]
      }
    } as any

    const diagnostics = runRealActivationDiagnostics({ protocolDraft: mockDraft })
    expect(diagnostics.status).toBe('healthy')
  })
})
