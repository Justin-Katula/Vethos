import { describe, it, expect } from 'vitest'
import { buildRealActivationPermissionMatrix } from './real-activation-permission-matrix'

describe('real-activation-permission-matrix', () => {
  it('grantedNow false', () => {
    const res = buildRealActivationPermissionMatrix({ boundary: { status: 'defined_for_audit_only' } as any, moduleAudit: [] })
    expect(res.permissions.every(p => p.grantedNow === false)).toBe(true)
  })

  it('canRequestNow false', () => {
    const res = buildRealActivationPermissionMatrix({ boundary: { status: 'defined_for_audit_only' } as any, moduleAudit: [] })
    expect(res.permissions.every(p => p.canRequestNow === false)).toBe(true)
  })

  it('canActivateNow false', () => {
    const res = buildRealActivationPermissionMatrix({ boundary: { status: 'defined_for_audit_only' } as any, moduleAudit: [] })
    expect(res.canActivateNow).toBe(false)
  })

  it('OS permission warning', () => {
    const res = buildRealActivationPermissionMatrix({ boundary: { status: 'defined_for_audit_only' } as any, moduleAudit: [] })
    const osPerm = res.permissions.find(p => p.category === 'os')
    expect(osPerm).toBeDefined()
    expect(osPerm?.riskLevel).toBe('critical')
  })
})
