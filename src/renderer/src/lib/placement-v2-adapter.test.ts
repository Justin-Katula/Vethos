import { describe, it, expect } from 'vitest'
import { mapProposedPlacementBlocksToPlacedBlocks, buildV1DiagnosticsFromV2 } from './placement-v2-adapter'
import type { ProposedPlacementBlock, PlacementPlanV2 } from '../../../shared/placement-model'
import type { Task, Objective } from '@shared/schemas'

describe('placement-v2-adapter', () => {
  it('should map ProposedPlacementBlock to PlacedBlock correctly', () => {
    const proposed: ProposedPlacementBlock[] = [
      {
        id: 'block-1',
        targetType: 'task',
        targetId: 'task-123',
        kind: 'work',
        title: 'Faire les devoirs',
        date: '2026-06-27',
        start: '09:30',
        end: '11:15',
        durationMinutes: 105,
        sourceWindowId: 'win-1',
        linkedTaskId: 'task-123',
        placementMode: 'normal',
        confidence: 0.9,
        locked: false,
        reasons: ['deadline proche'],
        warnings: [],
      },
      {
        id: 'block-2',
        targetType: 'strategy_block',
        targetId: 'break-456',
        kind: 'recovery',
        title: 'Pause café',
        date: '2026-06-27',
        start: '14:00',
        end: '14:15',
        durationMinutes: 15,
        sourceWindowId: 'win-1',
        placementMode: 'normal',
        confidence: 1.0,
        locked: false,
        reasons: [],
        warnings: [],
      }
    ]

    const mapped = mapProposedPlacementBlocksToPlacedBlocks(proposed)

    expect(mapped).toHaveLength(2)
    
    expect(mapped[0]).toEqual({
      id: 'block-1',
      date: '2026-06-27',
      startMinute: 9 * 60 + 30, // 570
      endMinute: 11 * 60 + 15, // 675
      kind: 'task',
      refKind: 'task',
      refId: 'task-123',
      label: 'Faire les devoirs',
      locked: true,
      linkedTaskId: 'task-123',
      linkedTaskIds: ['task-123'],
    })

    expect(mapped[1]).toEqual({
      id: 'block-2',
      date: '2026-06-27',
      startMinute: 14 * 60, // 840
      endMinute: 14 * 60 + 15, // 855
      kind: 'break',
      refKind: 'break',
      refId: 'break-456',
      label: 'Pause café',
      locked: true,
      linkedTaskId: null,
      linkedTaskIds: [],
    })
  })

  it('should build V1 diagnostics from V2 plan correctly', () => {
    const planV2: PlacementPlanV2 = {
      userId: 'user-1',
      dateRange: { startDate: '2026-06-27', endDate: '2026-06-28' },
      mode: 'normal',
      proposedBlocks: [
        {
          id: 'block-1',
          targetType: 'task',
          targetId: 'task-1',
          kind: 'work',
          title: 'Tâche A',
          date: '2026-06-27',
          start: '09:00',
          end: '10:00',
          durationMinutes: 60,
          sourceWindowId: 'win-1',
          placementMode: 'normal',
          confidence: 1.0,
          locked: false,
          reasons: [],
          warnings: []
        }
      ],
      unplacedItems: [
        {
          targetType: 'task',
          targetId: 'task-2',
          reason: 'capacity_exceeded',
          explanation: 'No more room',
          suggestedNextAction: 'reduce_scope',
          confidence: 0.8
        }
      ],
      usedWindowIds: ['win-1'],
      summary: {
        totalProposedMinutes: 60,
        deepWorkMinutes: 60,
        shortActionMinutes: 0,
        rescueMinutes: 0,
        bufferMinutes: 0,
        unplacedCount: 1
      },
      warnings: [],
      explanation: { title: 'Explanation', summary: 'Summary', reasons: [] },
      confidence: 100,
      metadata: {
        modelVersion: 2,
        createdAt: '2026-06-27T08:00:00.000Z',
        updatedAt: '2026-06-27T08:00:00.000Z',
        source: 'placement_engine',
      },
    }

    const tasks: Task[] = [
      { id: 'task-1', title: 'Tâche A', linkedObjectiveId: null, deadline: '2026-06-28', estimatedMinutes: 60, remainingMinutes: 60, level: 1, status: 'active', createdAt: '2026-06-27T08:00:00.000Z' },
      { id: 'task-2', title: 'Tâche B', linkedObjectiveId: null, deadline: '2026-06-28', estimatedMinutes: 45, remainingMinutes: 45, level: 1, status: 'active', createdAt: '2026-06-27T08:00:00.000Z' }
    ]

    const objectives: Objective[] = [
      { id: 'obj-1', name: 'Objectif A', level: 1, status: 'active', color: '#ff0000', linkedRuleIds: [], createdAt: '2026-06-27T08:00:00.000Z' }
    ]

    const diag = buildV1DiagnosticsFromV2(planV2, tasks, objectives, 300)

    expect(diag.status).toBe('impossible') // due to unplaced task-2
    expect(diag.totalFreeMinutes).toBe(300)
    expect(diag.plannedMinutes).toBe(60)
    expect(diag.unplannedMinutes).toBe(240)
    expect(diag.items).toHaveLength(3)

    // Task A: placed
    const itemA = diag.items.find(i => i.refId === 'task-1')
    expect(itemA).toBeDefined()
    expect(itemA!.placedMinutes).toBe(60)
    expect(itemA!.status).toBe('planifiable')

    // Task B: unplaced
    const itemB = diag.items.find(i => i.refId === 'task-2')
    expect(itemB).toBeDefined()
    expect(itemB!.placedMinutes).toBe(0)
    expect(itemB!.status).toBe('impossible')

    // Objective A: unplaced
    const itemObj = diag.items.find(i => i.refId === 'obj-1')
    expect(itemObj).toBeDefined()
    expect(itemObj!.placedMinutes).toBe(0)
  })
})
