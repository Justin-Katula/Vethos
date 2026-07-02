import { describe, it, expect } from 'vitest'
import { runRealActivationReadiness } from './real-activation-readiness-engine'

describe('real-activation-readiness-engine', () => {
  it('guarantees canProceedToRealExecution is false and nextAllowedStep is not execute', () => {
    const mockDraft = {
      canProceedToRealExecution: false,
      blockers: [],
      permissionMatrix: {
        permissions: [
          { id: '1', grantedNow: false, canRequestNow: false }
        ]
      }
    } as any

    const readiness = runRealActivationReadiness({ protocolDraft: mockDraft })
    expect(readiness.canProceedToRealExecution).toBe(false)
    expect(readiness.nextAllowedStep).not.toBe('execute')
    expect(readiness.nextAllowedStep).toBe('keep_audit_only')
  })

  it('detects a permission breach as failed status and critical severity', () => {
    const breachedDraft = {
      canProceedToRealExecution: false,
      blockers: [],
      permissionMatrix: {
        permissions: [
          { id: '1', grantedNow: true, canRequestNow: false }
        ]
      }
    } as any

    const readiness = runRealActivationReadiness({ protocolDraft: breachedDraft })
    expect(readiness.status).toBe('invalid')
    expect(readiness.nextAllowedStep).toBe('do_not_execute')
    const breachCheck = readiness.readinessChecks.find(c => c.id === 'check-permissions-breach')
    expect(breachCheck).toBeDefined()
    expect(breachCheck?.severity).toBe('critical')
  })
})
