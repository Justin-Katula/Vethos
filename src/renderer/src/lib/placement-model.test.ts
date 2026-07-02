import { describe, expect, it } from 'vitest'
import type { ProposedPlacementBlock, PlacementCandidate } from '@shared/placement-model'

describe('placement-model', () => {
  it('defines valid types and ensures locked is false', () => {
    const block: ProposedPlacementBlock = {
      id: 'test-1',
      targetType: 'task',
      targetId: 't1',
      kind: 'work',
      title: 'Test',
      date: '2026-06-25',
      start: '10:00',
      end: '11:00',
      durationMinutes: 60,
      sourceWindowId: 'win-1',
      placementMode: 'normal',
      confidence: 90,
      locked: false,
      reasons: [],
      warnings: [],
    }

    expect(block.locked).toBe(false)
    expect(block.durationMinutes).toBeGreaterThanOrEqual(0)
  })

  it('defines candidates correctly', () => {
    const candidate: PlacementCandidate = {
      id: 'c1',
      targetType: 'task',
      targetId: 't1',
      title: 'Test Candidate',
      remainingMinutes: 120,
      minimumUsefulMinutes: 30,
      recommendedMinutes: 60,
      maximumSafeMinutes: 180,
      requiresDeepWork: false,
      canSplit: true,
      canUseShortGap: false,
      shouldAvoidLateNight: false,
      priorityScore: 80,
      reasons: [],
      warnings: [],
      confidence: 85,
    }

    expect(candidate.priorityScore).toBeGreaterThanOrEqual(0)
    expect(candidate.priorityScore).toBeLessThanOrEqual(100)
    expect(candidate.minimumUsefulMinutes).toBeGreaterThanOrEqual(0)
  })
})
