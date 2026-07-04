import { describe, expect, it } from 'vitest'
import { buildSessionContract } from './session-contract-builder'
import type { SessionInputData } from './session-input-adapter'

describe('session-contract-builder', () => {
  const baseInput: SessionInputData = {
    targetType: 'task',
    targetId: 't1',
    placementBlock: {
      id: 'block1',
      targetType: 'task',
      targetId: 't1',
      kind: 'work',
      title: 'Work Block',
      date: '2026-06-26',
      start: '10:00',
      end: '11:00',
      durationMinutes: 60,
      sourceWindowId: 'win1',
      placementMode: 'normal',
      confidence: 100,
      locked: false,
      reasons: [],
      warnings: [],
    },
    warnings: [],
    confidence: 100,
  }

  it('builds useful contract for concrete task', () => {
    const res = buildSessionContract({
      ...baseInput,
      linkedTask: { id: 't1', title: 'Task Title' }
    })
    expect(res.purpose).toContain('Task Title')
    expect(res.allowedToMarkTaskCompleted).toBe(true)
    expect(res.completionPolicy).toBe('progress_review')
  })

  it('forces progress_review/manual_review for vague task', () => {
    const res = buildSessionContract({
      ...baseInput,
      linkedTask: { id: 't1', isVague: true }
    })
    expect(res.allowedToMarkTaskCompleted).toBe(false)
    expect(res.completionPolicy).toBe('manual_review')
  })

  it('forces completion_gate and strict evidence for important tasks', () => {
    const res = buildSessionContract({
      ...baseInput,
      linkedTask: { id: 't1', title: 'Important work' },
      priorityScore: { targetId: 't1', priorityScore: 90 }
    })
    expect(res.completionPolicy).toBe('completion_gate')
    expect(res.requiresStrictEvidence).toBe(true)
    expect(res.allowedToMarkTaskCompleted).toBe(true)
  })

  it('blocks completion for strategy_block', () => {
    const res = buildSessionContract({
      ...baseInput,
      targetType: 'strategy_block',
    })
    expect(res.allowedToMarkTaskCompleted).toBe(false)
    expect(res.completionPolicy).toBe('session_only')
  })

  it('blocks completion for objective without task', () => {
    const res = buildSessionContract({
      ...baseInput,
      targetType: 'objective',
    })
    expect(res.allowedToMarkTaskCompleted).toBe(false)
    expect(res.completionPolicy).toBe('manual_review')
  })

  it('requires strict evidence in deadline crisis rescue', () => {
    const res = buildSessionContract({
      ...baseInput,
      linkedTask: { id: 't1', title: 'Critical work' },
      deadlineCrisisContext: { targetId: 't1', crisisLevel: 'critical', recommendedMode: 'rescue_plan' }
    })
    // Rescue mode itself does not force strict evidence unless important, but let's check completion policy
    expect(res.completionPolicy).toBe('progress_review')
    expect(res.progressDefinition).toBe('artifact_progress')
    expect(res.requiresStrictEvidence).toBe(true)
  })

  it('does not hardcode text like "examen" or "chapitre"', () => {
    // Behavior is tested via structural signals, not strings
    const res = buildSessionContract({
      ...baseInput,
      linkedTask: { id: 't1', title: 'Neutral work' },
      placementBlock: { ...baseInput.placementBlock, title: 'examen_preparation' }
    })
    // Doesn't trigger strictness just by the word "examen"
    expect(res.completionPolicy).toBe('progress_review')
    expect(res.requiresStrictEvidence).toBe(false)
  })
})
