import { describe, expect, it } from 'vitest'
import { resolvePlacementConflicts } from './placement-conflict-resolver'
import type { ProposedPlacementBlock } from '@shared/placement-model'

describe('placement-conflict-resolver', () => {
  const baseBlock = {
    id: 'b1',
    targetId: 't1',
    start: '10:00',
    end: '11:00',
    durationMinutes: 60,
    priorityScore: 50,
    confidence: 100,
  } as ProposedPlacementBlock

  const context = { usableFreeWindows: [] }

  it('keeps non-overlapping blocks', () => {
    const blocks = [
      { ...baseBlock, id: 'b1', targetId: 't1', start: '10:00', end: '11:00' },
      { ...baseBlock, id: 'b2', targetId: 't2', start: '11:00', end: '12:00' }, // adjacent
    ]

    const result = resolvePlacementConflicts({ proposedBlocks: blocks, planningContext: context })
    expect(result.blocks).toHaveLength(2)
    expect(result.removedBlocks).toHaveLength(0)
  })

  it('removes overlapping block with lower priority', () => {
    const blocks = [
      { ...baseBlock, id: 'low-prio', targetId: 't1', start: '10:30', end: '11:30', priorityScore: 40 },
      { ...baseBlock, id: 'high-prio', targetId: 't2', start: '10:00', end: '11:00', priorityScore: 90 },
    ]

    const result = resolvePlacementConflicts({ proposedBlocks: blocks, planningContext: context })
    expect(result.blocks).toHaveLength(1)
    expect(result.blocks[0]!.id).toBe('high-prio')
    expect(result.removedBlocks).toHaveLength(1)
    expect(result.removedBlocks[0]!.id).toBe('low-prio')
    expect(result.warnings[0]!).toContain('Chevauchement')
  })

  it('allows multiple non-overlapping blocks for same targetId', () => {
    const blocks = [
      { ...baseBlock, id: 'first', targetId: 't1', priorityScore: 80, start: '10:00', end: '11:00' },
      { ...baseBlock, id: 'second', targetId: 't1', priorityScore: 50, start: '14:00', end: '15:00' }, // Different time, same target
    ]

    const result = resolvePlacementConflicts({ proposedBlocks: blocks, planningContext: context })
    expect(result.blocks).toHaveLength(2)
    expect(result.removedBlocks).toHaveLength(0)
  })

  it('sorts final blocks chronologically', () => {
    const blocks = [
      { ...baseBlock, id: 'b2', targetId: 't2', start: '14:00', end: '15:00' },
      { ...baseBlock, id: 'b1', targetId: 't1', start: '10:00', end: '11:00' },
    ]

    const result = resolvePlacementConflicts({ proposedBlocks: blocks, planningContext: context })
    expect(result.blocks[0]!.id).toBe('b1') // 10:00 comes before 14:00
  })
})
