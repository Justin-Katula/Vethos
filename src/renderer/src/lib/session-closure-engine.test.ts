import { describe, expect, it } from 'vitest'
import { buildSessionClosurePlan } from './session-closure-engine'

describe('session-closure-engine', () => {
  it('generates simple closure for session_only', () => {
    const res = buildSessionClosurePlan({
      contract: { completionPolicy: 'session_only', requiresClosureReview: false, targetType: 'task' } as any
    })
    expect(res.required).toBe(false)
    expect(res.closurePromptType).toBe('simple')
  })

  it('generates completion gate questions', () => {
    const res = buildSessionClosurePlan({
      contract: { completionPolicy: 'completion_gate', requiresClosureReview: true, targetType: 'task' } as any
    })
    expect(res.required).toBe(true)
    expect(res.closurePromptType).toBe('completion_gate')
    expect(res.requiresSpecificAnswer).toBe(true)
    expect(res.minimumSpecificityScore).toBe(70)
  })

  it('downgrades claimed_completed for strategy blocks', () => {
    const res = buildSessionClosurePlan({
      contract: { completionPolicy: 'completion_gate', requiresClosureReview: true, targetType: 'strategy_block' } as any
    })
    expect(res.allowedOutcomes).toBe('confirmed_progress')
    expect(res.reasons.some(r => r.includes("On ne peut pas marquer 'completed'"))).toBe(true)
  })

  it('forces progress review questions for rescue', () => {
    const res = buildSessionClosurePlan({
      contract: { completionPolicy: 'progress_review', targetType: 'task' } as any,
      sessionPlan: { mode: 'rescue' } as any
    })
    expect(res.questions.some(q => q.includes('Rescue'))).toBe(true)
  })
})
