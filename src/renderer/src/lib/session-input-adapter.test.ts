import { describe, expect, it } from 'vitest'
import { buildSessionInputFromPlacement } from './session-input-adapter'
import type { ProposedPlacementBlock } from '@shared/placement-model'
import { buildEmptyUserModel } from '@shared/user-model'

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
    expect(res.linkedTask).toBeUndefined()
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

  it('consumes placement plan, planning, priority, crisis, user and app-site context', () => {
    const userModel = buildEmptyUserModel('user-1', { now: '2026-06-26T09:00:00.000Z' })
    userModel.appSitePreferences = [{
      identifier: 'neutral-tool.exe', kind: 'app', updatedAt: '2026-06-26T09:00:00.000Z',
      contextRules: [{
        contextType: 'task', contextId: 't1', classification: 'useful', confidence: 90,
        source: 'user', reasons: ['Declared useful.'], updatedAt: '2026-06-26T09:00:00.000Z',
      }],
    }]
    const placementPlanV2 = {
      userId: 'user-1', dateRange: { startDate: baseBlock.date, endDate: baseBlock.date }, mode: 'normal' as const,
      proposedBlocks: [baseBlock], unplacedItems: [], usedWindowIds: ['win1'],
      summary: { totalProposedMinutes: 60, deepWorkMinutes: 0, shortActionMinutes: 0, rescueMinutes: 0, bufferMinutes: 0, unplacedCount: 0 },
      warnings: [], explanation: { title: 'Plan', summary: 'Plan', reasons: [] }, confidence: 90,
      metadata: { modelVersion: 2, createdAt: '2026-06-26T09:00:00.000Z', updatedAt: '2026-06-26T09:00:00.000Z', source: 'placement_engine' as const },
    }
    const planningContext = {
      userId: 'user-1', dateRange: placementPlanV2.dateRange,
      days: [{
        date: baseBlock.date, timeline: [], freeWindows: [], rawFreeMinutes: 60, usableFreeMinutes: 60,
        deepWorkMinutes: 0, shortGapMinutes: 0, recoveryMinutes: 0, preparationMinutes: 0,
        transitionMinutes: 0, tinyGapMinutes: 0, unusableMinutes: 0, status: 'healthy' as const,
        reasons: [], metadata: { modelVersion: 2, createdAt: '2026-06-26T09:00:00.000Z', updatedAt: '2026-06-26T09:00:00.000Z' },
      }],
      weeklySummary: { rawFreeMinutes: 60, usableFreeMinutes: 60, deepWorkMinutes: 0, recoveryMinutes: 0, overloadedDays: 0, noUsableTimeDays: 0 },
      rulesApplied: [], confidence: 90,
      metadata: { modelVersion: 2, createdAt: '2026-06-26T09:00:00.000Z', updatedAt: '2026-06-26T09:00:00.000Z', source: 'planning_context_builder' as const },
    }
    const result = buildSessionInputFromPlacement({
      placementBlock: baseBlock,
      placementPlanV2,
      taskModelsV2: [{ id: 't1', title: 'Generic task' }],
      priorityScoresV2: [{ targetId: 't1', priorityScore: 82 }],
      planningContext,
      deadlineCrisisContexts: [{ targetId: 't1', crisisLevel: 'tight', recommendedMode: 'intensive_plan' }],
      userModel,
    })
    expect(result.placementPlanV2).toBe(placementPlanV2)
    expect(result.planningContext).toBe(planningContext)
    expect(result.priorityScore).toBeDefined()
    expect(result.deadlineCrisisContext).toBeDefined()
    expect(result.userModel).toBe(userModel)
    expect(result.appSiteContext?.usefulApps).toContain('neutral-tool.exe')
  })
})
