import { describe, it, expect } from 'vitest'
import { buildExecutionPreviewPlanV2 } from './execution-preview-plan-builder'
import type { ExecutionPreviewInputPayload } from './execution-preview-input-adapter'

describe('execution-preview-plan-builder', () => {
  it('builds a shadow plan without calling real managers', () => {
    const input: ExecutionPreviewInputPayload = {
      userId: 'u1',
      dateRange: { startDate: '2026-06-26T00:00:00Z', endDate: '2026-06-26T23:59:59Z' },
      objectiveModelsV2: [{ id: 'o1' }],
      taskModelsV2: [{ id: 't1' }],
      priorityScoresV2: [{ id: 'ps1' }],
      planningContextV2: {},
      placementPlanV2: {
        days: [{ date: '2026-06-26', blocks: [{ id: 'b1', sessionPlanId: 's1', durationMinutes: 30, start: '2026-06-26T10:00', end: '2026-06-26T10:30' }] }]
      },
      sessionPlansV2: [{ id: 's1' }],
      runtimeCoordinatorPlansV2: [{ id: 'r1', sessionPlanId: 's1', blockingProfileDraft: { overlayBehavior: { shouldAvoidKillProcess: true, preferredMethod: 'attached_overlay_existing_system' }, mediaBehavior: { scope: 'target_app_only' } } }],
      idFactory: () => 'pid1'
    }

    const plan = buildExecutionPreviewPlanV2(input)

    // Verify purely shadow
    expect(plan.id).toBe('pid1')
    expect(plan.metadata.source).toBe('execution_preview')
    expect(plan.readiness.canApplyLater).toBe(false)
    expect(plan.status).toBe('ready_for_preview')
    expect(plan.mode).toBe('debug_preview')
    expect(plan.pipelineTrace.steps.length).toBeGreaterThan(0)
    expect(plan.diagnostics?.status).toBe('healthy')
  })

  it('blocks if safety is critical', () => {
    const input: ExecutionPreviewInputPayload = {
      userId: 'u1',
      dateRange: { startDate: '2026-06-26T00:00:00Z', endDate: '2026-06-26T23:59:59Z' },
      sessionPlansV2: [{ id: 's1', closure: { shouldApplyOutcomeToTaskStoreNow: true } }]
    }

    const plan = buildExecutionPreviewPlanV2(input)
    expect(plan.status).toBe('blocked_by_safety')
    expect(plan.mode).toBe('unsafe')
  })

  it('downgrades to partial preview if some inputs are missing', () => {
    const input: ExecutionPreviewInputPayload = {
      userId: 'u1',
      dateRange: { startDate: '2026-06-26T00:00:00Z', endDate: '2026-06-26T23:59:59Z' },
      objectiveModelsV2: [{ id: 'o1' }],
      taskModelsV2: [{ id: 't1' }],
      priorityScoresV2: [{ id: 'ps1' }],
      planningContextV2: {},
      placementPlanV2: {
        days: [{ date: '2026-06-26', blocks: [{ id: 'b1' }] }]
      },
      // missing session and runtime plans
    }

    const plan = buildExecutionPreviewPlanV2(input)
    expect(plan.status).toBe('partial_preview')
  })
})
