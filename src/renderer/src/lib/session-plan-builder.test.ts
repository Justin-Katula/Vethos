import { describe, expect, it } from 'vitest'
import type { ProposedPlacementBlock } from '@shared/placement-model'
import { buildSessionPlanV2 } from './session-plan-builder'

const block: ProposedPlacementBlock = {
  id: 'block-1', targetType: 'task', targetId: 'task-1', kind: 'work', title: 'Generic work',
  date: '2026-06-26', start: '10:00', end: '11:00', durationMinutes: 60,
  sourceWindowId: 'window-1', placementMode: 'normal', confidence: 90, locked: false,
  reasons: [], warnings: [],
}

describe('session-plan-builder', () => {
  const duringSession = new Date('2026-06-26T10:05:00').toISOString()
  it('runs the complete pure pipeline with deterministic now and id', () => {
    const result = buildSessionPlanV2({
      userId: 'user-1', placementBlock: block,
      taskModelsV2: [{ id: 'task-1', title: 'Generic target' }],
      now: duringSession, idFactory: () => 'session-1',
    })
    expect(result.id).toBe('session-1')
    expect(result.metadata.createdAt).toBe(duringSession)
    expect(result.linkedTaskId).toBe('task-1')
    expect(result.lifecycle.initialState).toBe('ready')
    expect(result.explanation.summary).toContain('60 min')
    expect(result.diagnostics?.status).toBe('healthy')
    expect(JSON.stringify(result)).not.toMatch(/NaN|Infinity/u)
  })

  it('returns an invalid/manual plan instead of throwing for a missing target', () => {
    const result = buildSessionPlanV2({
      userId: 'user-1', placementBlock: block, taskModelsV2: [],
      now: duringSession, idFactory: () => 'session-2',
    })
    expect(result.preflight.canStart).toBe(false)
    expect(result.lifecycle.initialState).toBe('invalid')
    expect(result.confidence).toBeLessThanOrEqual(40)
  })

  it('never invents a task for a strategy block', () => {
    const result = buildSessionPlanV2({
      userId: 'user-1',
      placementBlock: { ...block, targetType: 'strategy_block', targetId: 'strategy-1' },
      taskModelsV2: [{ id: 'strategy-1', title: 'Coincidental id' }],
      now: duringSession, idFactory: () => 'session-3',
    })
    expect(result.linkedTaskId).toBeUndefined()
    expect(result.contract.allowedToMarkTaskCompleted).toBe(false)
  })

  it('does not mutate supplied models or the placement block', () => {
    const tasks = [{ id: 'task-1', title: 'Immutable target' }]
    const before = JSON.stringify({ tasks, block })
    buildSessionPlanV2({ userId: 'user-1', placementBlock: block, taskModelsV2: tasks, now: duringSession })
    expect(JSON.stringify({ tasks, block })).toBe(before)
  })
})
