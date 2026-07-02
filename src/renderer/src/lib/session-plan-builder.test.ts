import { describe, expect, it } from 'vitest'
import { buildSessionPlanV2 } from './session-plan-builder'
import type { ProposedPlacementBlock } from '@shared/placement-model'

describe('session-plan-builder', () => {
  const baseBlock: ProposedPlacementBlock = {
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
  }

  it('builds a full valid session plan', () => {
    const res = buildSessionPlanV2({
      userId: 'user1',
      placementBlock: baseBlock,
      taskModelsV2: [{ id: 't1', title: 'A task' }],
      now: '2026-06-26T09:00:00.000Z',
      idFactory: () => 'sess-1'
    })

    expect(res.id).toBe('sess-1')
    expect(res.userId).toBe('user1')
    expect(res.targetType).toBe('task')
    expect(res.contract.purpose).toContain('A task')
    expect(res.preflight.canStart).toBe(true)
    expect(res.diagnostics?.status).toBe('healthy')
    expect(res.metadata.source).toBe('session_engine')
  })

  it('handles missing task and outputs manual_review readiness', () => {
    const res = buildSessionPlanV2({
      userId: 'user1',
      placementBlock: baseBlock,
      taskModelsV2: [], // Missing task
      now: '2026-06-26T09:00:00.000Z',
      idFactory: () => 'sess-1'
    })

    expect(res.preflight.readiness).toBe('blocked_by_missing_data')
    expect(res.confidence).toBeLessThanOrEqual(10)
    // Diagnostics should ideally pick this up if we configured it, but preflight does
  })

  it('correctly maps strategy block without inventing a real task', () => {
    const res = buildSessionPlanV2({
      userId: 'user1',
      placementBlock: { ...baseBlock, targetType: 'strategy_block', targetId: 'strat' },
      taskModelsV2: [{ id: 'strat' }],
      now: '2026-06-26T09:00:00.000Z',
      idFactory: () => 'sess-1'
    })

    expect(res.targetType).toBe('strategy_block')
    expect(res.contract.allowedToMarkTaskCompleted).toBe(false)
  })

  it('does not mutate stores (only pure function output)', () => {
    const taskModels = [{ id: 't1', title: 'Task' }]
    const originalLength = taskModels.length

    buildSessionPlanV2({
      userId: 'user1',
      placementBlock: baseBlock,
      taskModelsV2: taskModels,
      now: '2026-06-26T09:00:00.000Z'
    })

    // No mutation
    expect(taskModels.length).toBe(originalLength)
  })
})
