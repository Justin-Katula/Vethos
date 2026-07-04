import { describe, expect, it } from 'vitest'
import { buildSessionInterruptionPolicy } from './session-interruption-policy'

describe('session-interruption-policy', () => {
  it('allows flexibility for review sessions', () => {
    const res = buildSessionInterruptionPolicy({
      sessionPlan: { mode: 'review', plannedDurationMinutes: 30 } as any
    })
    expect(res.earlyStopPolicy).toBe('allow')
    expect(res.interruptionSeverity).toBe('low')
  })

  it('restricts rescue sessions', () => {
    const res = buildSessionInterruptionPolicy({
      sessionPlan: { mode: 'rescue', plannedDurationMinutes: 45 } as any
    })
    expect(res.earlyStopPolicy).toBe('deny_if_strict')
    expect(res.interruptionSeverity).toBe('critical')
    expect(res.allowPause).toBe(true)
    expect(res.maxPauseMinutes).toBe(2)
  })

  it('hardens policy for high risk users', () => {
    const res = buildSessionInterruptionPolicy({
      sessionPlan: { mode: 'normal', plannedDurationMinutes: 60 } as any,
      userModel: { disciplineRiskLevel: 'high' }
    })
    // Normal is justification -> hardened is cooldown_and_justification
    expect(res.earlyStopPolicy).toBe('cooldown_and_justification')
    expect(res.interruptionSeverity).toBe('high') // Upgraded from medium
  })
})
