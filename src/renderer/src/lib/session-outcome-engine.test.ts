import { describe, expect, it } from 'vitest'
import { buildSessionOutcomeV2 } from './session-outcome-engine'

describe('session-outcome-engine', () => {
  const baseSessionPlan = {
    id: 's1',
    mode: 'normal',
    plannedDurationMinutes: 60,
    contract: {
      requiresClosureReview: true,
      allowedToMarkTaskCompleted: true,
      completionPolicy: 'progress_review'
    } as any
  } as any

  const baseIntegrity = {
    integrityScore: 80,
    activeDurationMinutes: 60
  } as any

  it('rejects completion without closure if required', () => {
    const res = buildSessionOutcomeV2({
      sessionPlan: baseSessionPlan,
      integrityResult: baseIntegrity
    })
    expect(res.outcome).toBe('manual_review_required')
    expect(res.shouldMarkTaskCompleted).toBe(false)
  })

  it('accepts partial progress based on user selection', () => {
    const res = buildSessionOutcomeV2({
      sessionPlan: baseSessionPlan,
      integrityResult: baseIntegrity,
      closureResponse: { selectedOutcome: 'partial_progress' }
    })
    expect(res.outcome).toBe('partial_progress')
    expect(res.shouldReduceRemainingMinutes).toBe(true)
    expect(res.shouldMarkTaskCompleted).toBe(false)
  })

  it('low integrity can downgrade completion claim to manual_review_required', () => {
    const res = buildSessionOutcomeV2({
      sessionPlan: baseSessionPlan,
      integrityResult: { ...baseIntegrity, integrityScore: 20 },
      closureResponse: { selectedOutcome: 'claimed_completed' }
    })
    expect(res.outcome).toBe('manual_review_required')
    expect(res.shouldMarkTaskCompleted).toBe(false)
    expect(res.warnings.join('')).toContain('Revue manuelle')
  })

  it('strategy_block never verifies completion', () => {
    const res = buildSessionOutcomeV2({
      sessionPlan: { ...baseSessionPlan, contract: { ...baseSessionPlan.contract, allowedToMarkTaskCompleted: false } },
      integrityResult: baseIntegrity,
      closureResponse: { selectedOutcome: 'claimed_completed' }
    })
    expect(res.outcome).toBe('completion_rejected')
    expect(res.shouldMarkTaskCompleted).toBe(false)
  })

  it('vague objective never verifies completion', () => {
    const res = buildSessionOutcomeV2({
      sessionPlan: { ...baseSessionPlan, contract: { ...baseSessionPlan.contract, allowedToMarkTaskCompleted: false } },
      integrityResult: baseIntegrity,
      closureResponse: { selectedOutcome: 'claimed_completed' }
    })
    expect(res.outcome).toBe('completion_rejected')
    expect(res.shouldMarkTaskCompleted).toBe(false)
  })

  it('high integrity alone does not verify completion', () => {
    const res = buildSessionOutcomeV2({
      sessionPlan: baseSessionPlan,
      integrityResult: { integrityScore: 100, activeDurationMinutes: 60 } as any,
      closureResponse: { selectedOutcome: 'claimed_completed' }
    })
    expect(res.outcome).toBe('manual_review_required')
    expect(res.shouldMarkTaskCompleted).toBe(false)
    expect(res.warnings.join('')).toContain('L\'intégrité seule ne permet pas de vérifier la complétion')
  })

  it('claimed_completed without approved completion gate does not mark task completed', () => {
    const res = buildSessionOutcomeV2({
      sessionPlan: { ...baseSessionPlan, contract: { ...baseSessionPlan.contract, completionPolicy: 'completion_gate' } },
      integrityResult: baseIntegrity,
      closureResponse: { selectedOutcome: 'claimed_completed' }
    })
    expect(res.outcome).toBe('manual_review_required') 
    expect(res.shouldMarkTaskCompleted).toBe(false)
  })

  it('approved completion gate can verify completion when contract allows it', () => {
    const res2 = buildSessionOutcomeV2({
      sessionPlan: { ...baseSessionPlan, contract: { ...baseSessionPlan.contract, completionPolicy: 'completion_gate' } },
      integrityResult: baseIntegrity,
      closureResponse: { selectedOutcome: 'claimed_completed' },
      completionGateResult: { approved: true }
    })
    expect(res2.outcome).toBe('completion_verified')
    expect(res2.shouldMarkTaskCompleted).toBe(true)
  })
})
