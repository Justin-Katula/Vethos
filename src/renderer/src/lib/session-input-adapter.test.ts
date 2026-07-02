import { describe, expect, it } from 'vitest'
import { buildSessionInputFromPlacement } from './session-input-adapter'
import type { ProposedPlacementBlock } from '@shared/placement-model'

describe('session-input-adapter', () => {
  const baseBlock: ProposedPlacementBlock = {
    id: 'block-1',
    targetType: 'task',
    targetId: 't1',
    kind: 'work',
    title: 'Block title',
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

  it('binds valid task block to task model', () => {
    const res = buildSessionInputFromPlacement({
      placementBlock: baseBlock,
      taskModelsV2: [{ id: 't1', title: 'A task' }],
    })
    expect(res.linkedTask?.title).toBe('A task')
    expect(res.confidence).toBe(100)
    expect(res.warnings).toHaveLength(0)
  })

  it('binds valid objective block to objective model', () => {
    const res = buildSessionInputFromPlacement({
      placementBlock: { ...baseBlock, targetType: 'objective', targetId: 'obj1' },
      objectiveModelsV2: [{ id: 'obj1', title: 'An objective' }],
    })
    expect(res.linkedObjective?.title).toBe('An objective')
    expect(res.confidence).toBe(100)
    expect(res.warnings).toHaveLength(0)
  })

  it('lowers confidence if task is missing', () => {
    const res = buildSessionInputFromPlacement({
      placementBlock: baseBlock,
      taskModelsV2: [],
    })
    expect(res.linkedTask).toBeUndefined()
    expect(res.confidence).toBeLessThan(100)
    expect(res.warnings[0]).toContain('introuvable')
  })

  it('keeps strategy_block as strategy_block and does not invent a task', () => {
    const res = buildSessionInputFromPlacement({
      placementBlock: { ...baseBlock, targetType: 'strategy_block', targetId: 'strat1' },
      taskModelsV2: [{ id: 'strat1' }], // Even if somehow it exists, it should not mutate targetType
    })
    expect(res.targetType).toBe('strategy_block')
    // Adapter doesn't prevent finding linked models if IDs match by coincidence, but builder will handle it
    expect(res.confidence).toBe(100)
  })

  it('lowers confidence if duration is 0', () => {
    const res = buildSessionInputFromPlacement({
      placementBlock: { ...baseBlock, durationMinutes: 0 },
      taskModelsV2: [{ id: 't1' }],
    })
    expect(res.confidence).toBe(50)
    expect(res.warnings[0]).toContain('invalide')
  })
})
