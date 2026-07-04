import { describe, it, expect } from 'vitest'
import { explainRealActivationProtocol } from './real-activation-explanation'

describe('real-activation-explanation', () => {
  it('generates general explanation and defaults to keep_audit_only', () => {
    const mockDraft = {
      boundary: { status: 'defined_for_audit_only' },
      permissionMatrix: { permissions: [] }
    } as any

    const explanation = explainRealActivationProtocol({ protocolDraft: mockDraft })
    expect(explanation.title).toContain('Audit')
    expect(explanation.nextRecommendedAction).toBe('keep_audit_only')
  })

  it('recommends do_not_execute if a permission breach is detected', () => {
    const mockDraft = {
      boundary: { status: 'defined_for_audit_only' },
      permissionMatrix: {
        permissions: [
          { id: '1', grantedNow: true }
        ]
      }
    } as any

    const explanation = explainRealActivationProtocol({ protocolDraft: mockDraft })
    expect(explanation.nextRecommendedAction).toBe('do_not_execute')
    expect(explanation.warnings.length).toBeGreaterThan(0)
  })
})
