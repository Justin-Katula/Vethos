import { describe, expect, it } from 'vitest'
import { calculateSessionIntegrity } from './session-integrity-engine'

describe('session-integrity-engine', () => {
  const basePlan = {
    id: 's1',
    plannedDurationMinutes: 60,
    mode: 'normal' as any,
    protection: { mode: 'blocklist' } as any
  }

  it('calculates perfect integrity with good signals', () => {
    const res = calculateSessionIntegrity({
      sessionPlan: basePlan,
      runtimeSignals: {
        activeDurationMinutes: 60,
        usefulActivityMinutes: 50,
        distractionAttemptCount: 0,
        unlockRequestCount: 0,
        idleMinutes: 5,
        completedNormally: true,
        earlyStopped: false
      }
    })
    expect(res.integrityScore).toBe(100)
    expect(res.suspiciousBehaviorScore).toBe(0)
    expect(res.sessionCompleted).toBe(true)
  })

  it('drops integrity with many distractions and early stop', () => {
    const res = calculateSessionIntegrity({
      sessionPlan: basePlan,
      runtimeSignals: {
        activeDurationMinutes: 20,
        usefulActivityMinutes: 5,
        distractionAttemptCount: 5,
        unlockRequestCount: 2,
        idleMinutes: 10,
        completedNormally: false,
        earlyStopped: true
      }
    })
    expect(res.integrityScore).toBeLessThan(50)
    expect(res.suspiciousBehaviorScore).toBeGreaterThan(40)
  })

  it('handles missing runtime signals gracefully', () => {
    const res = calculateSessionIntegrity({
      sessionPlan: basePlan
    })
    expect(res.confidence).toBe(0)
    expect(res.integrityScore).toBe(50)
    expect(res.reasons[0]).toContain('Aucun signal')
  })

  it('punishes unlocks in strict mode heavily', () => {
    const res = calculateSessionIntegrity({
      sessionPlan: { ...basePlan, protection: { mode: 'strict_allowlist' } as any },
      runtimeSignals: {
        activeDurationMinutes: 60,
        unlockRequestCount: 1,
      }
    })
    expect(res.warnings[0]).toContain('intégrité fortement impactée')
  })
})
