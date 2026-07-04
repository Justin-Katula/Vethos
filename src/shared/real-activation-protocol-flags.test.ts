import { describe, it, expect } from 'vitest'
import { realActivationProtocolFlags } from './real-activation-protocol-flags'

describe('real-activation-protocol-flags', () => {
  it('audit flags are true', () => {
    expect(realActivationProtocolFlags.realActivationProtocolEnabled).toBe(true)
    expect(realActivationProtocolFlags.realActivationProtocolAuditEnabled).toBe(true)
  })

  it('execution/write flags are strictly false', () => {
    expect(realActivationProtocolFlags.realActivationControlsRealManagers).toBe(false)
    expect(realActivationProtocolFlags.realActivationControlsStoreWrites).toBe(false)
    expect(realActivationProtocolFlags.realActivationControlsStartSessions).toBe(false)
    expect(realActivationProtocolFlags.realActivationControlsOsAccess).toBe(false)
  })
})
