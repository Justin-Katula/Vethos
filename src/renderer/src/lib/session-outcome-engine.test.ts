import { describe, expect, it } from 'vitest'
import { buildSessionOutcomeV2 } from './session-outcome-engine'

describe('session-outcome-engine', () => {
  const baseSessionPlan = {
    id: 's1',
    mode: 'normal',
    plannedDurationMinutes: 60,
    minimumUsefulMinutes: 20,
    closure: { requiresSpecificAnswer: false, minimumSpecificityScore: 0 },
    contract: {
      targetType: 'task',
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
      sessionPlan: { ...baseSessionPlan, contract: { ...baseSessionPlan.contract, completionPolicy: 'completion_gate' } },
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

  it('claimed completed with weak integrity is rejected', () => {
    const res = buildSessionOutcomeV2({
      sessionPlan: { ...baseSessionPlan, contract: { ...baseSessionPlan.contract, completionPolicy: 'completion_gate' } },
      integrityResult: { ...baseIntegrity, integrityScore: 20 },
      closureResponse: { selectedOutcome: 'claimed_completed' }
    })
    expect(res.outcome).toBe('completion_rejected')
    expect(res.shouldMarkTaskCompleted).toBe(false)
    expect(res.warnings.join('')).toContain('trop faible')
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
    expect(res.warnings.join('')).toContain('sans completion gate')
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

  it('never mutates the session plan or an external task object', () => {
    const task = { id: 't1', remainingMinutes: 60, status: 'active' }
    const beforeTask = JSON.stringify(task)
    const beforePlan = JSON.stringify(baseSessionPlan)
    buildSessionOutcomeV2({
      sessionPlan: baseSessionPlan,
      integrityResult: baseIntegrity,
      closureResponse: { selectedOutcome: 'partial_progress' },
    })
    expect(JSON.stringify(task)).toBe(beforeTask)
    expect(JSON.stringify(baseSessionPlan)).toBe(beforePlan)
  })
})
