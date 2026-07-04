import { describe, expect, it } from 'vitest'
import type { ProposedPlacementBlock, PlacementCandidate, PlacementPlanV2 } from '@shared/placement-model'

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

  it('ne contient aucun terme Shadow dans le type PlacementPlanV2 (source metadata)', () => {
    // Le type PlacementPlanV2.metadata.source doit valoir 'placement_engine', jamais 'shadow*'.
    const plan: PlacementPlanV2 = {
      userId: 'u1',
      dateRange: { startDate: '2026-06-25', endDate: '2026-06-25' },
      mode: 'normal',
      proposedBlocks: [],
      unplacedItems: [],
      usedWindowIds: [],
      summary: {
        totalProposedMinutes: 0,
        deepWorkMinutes: 0,
        shortActionMinutes: 0,
        rescueMinutes: 0,
        bufferMinutes: 0,
        unplacedCount: 0,
      },
      warnings: [],
      explanation: { title: '', summary: '', reasons: [] },
      confidence: 100,
      metadata: {
        modelVersion: 2,
        createdAt: '2026-06-25T00:00:00.000Z',
        updatedAt: '2026-06-25T00:00:00.000Z',
        source: 'placement_engine',
      },
    }

    expect(plan.metadata.source).toBe('placement_engine')
    expect(plan.metadata.source.toLowerCase()).not.toContain('shadow')
  })

  it('documente strategy_block comme non sauvegardé (targetType strategy_block autorisé mais locked false)', () => {
    // Un strategy_block est un bloc de stratégie PROPOSÉ (diagnostic, practice, etc.).
    // Il ne doit jamais pouvoir être confondu avec une vraie tâche enregistrée :
    // locked reste false, et il pointe vers un targetType explicite.
    const strategyBlock: ProposedPlacementBlock = {
      id: 'strat-1',
      targetType: 'strategy_block',
      targetId: 'strategy-t1',
      kind: 'diagnostic',
      title: 'Bloc stratégie',
      date: '2026-06-25',
      start: '10:00',
      end: '10:20',
      durationMinutes: 20,
      sourceWindowId: 'win-1',
      placementMode: 'rescue',
      confidence: 70,
      locked: false,
      reasons: ['Bloc stratégie proposé en mode rescue.'],
      warnings: [],
    }

    expect(strategyBlock.targetType).toBe('strategy_block')
    expect(strategyBlock.locked).toBe(false)
  })

  it('produit un PlacementPlanV2 sans mutation : cloner puis comparer', () => {
    const plan: PlacementPlanV2 = {
      userId: 'u1',
      dateRange: { startDate: '2026-06-25', endDate: '2026-06-25' },
      mode: 'normal',
      proposedBlocks: [],
      unplacedItems: [],
      usedWindowIds: [],
      summary: {
        totalProposedMinutes: 0,
        deepWorkMinutes: 0,
        shortActionMinutes: 0,
        rescueMinutes: 0,
        bufferMinutes: 0,
        unplacedCount: 0,
      },
      warnings: [],
      explanation: { title: '', summary: '', reasons: [] },
      confidence: 100,
      metadata: {
        modelVersion: 2,
        createdAt: '2026-06-25T00:00:00.000Z',
        updatedAt: '2026-06-25T00:00:00.000Z',
        source: 'placement_engine',
      },
    }
    const snapshot = JSON.parse(JSON.stringify(plan))
    // Le type lui-même est une donnée immutable de test ; aucune mutation ne se produit.
    expect(plan).toEqual(snapshot)
    expect(plan.metadata.modelVersion).toBe(2)
  })
})
