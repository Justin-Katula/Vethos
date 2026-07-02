import { describe, it, expect } from 'vitest'
import { buildRealActivationModuleAudit } from './real-activation-module-audit'

describe('real-activation-module-audit', () => {
  it('module audit symbolique', () => {
    const audit = buildRealActivationModuleAudit({})
    expect(audit.length).toBeGreaterThan(0)
    expect(audit[0]!.name).toBeTruthy()
    expect(audit[0]!.realFunctions.length).toBeGreaterThan(0)
  })

  it('no real import - all modules are described by strings', () => {
    const audit = buildRealActivationModuleAudit({})
    const manager = audit.find(a => a.kind === 'session_manager')
    expect(typeof manager?.path).toBe('string')
    expect(manager?.path).toContain('manager.ts')
  })

  it('canCallInPoint16 false for all functions', () => {
    const audit = buildRealActivationModuleAudit({})
    for (const mod of audit) {
      for (const fn of mod.realFunctions) {
        expect(fn.canCallInPoint16).toBe(false)
      }
    }
  })

  it('modules high risk', () => {
    const audit = buildRealActivationModuleAudit({})
    const hosts = audit.find(a => a.kind === 'hosts_writer')
    expect(hosts?.realFunctions[0]!.dangerLevel).toBe('critical')
  })

  it('candidates future point >= 17 (verified via candidate boolean)', () => {
    const audit = buildRealActivationModuleAudit({})
    expect(audit[0]!.realFunctions[0]!.candidateForFuturePoint).toBe(true)
  })
})
