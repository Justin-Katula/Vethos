import { describe, expect, it } from 'vitest'
import type { ExecutionPreviewSanitizedSnapshot } from '@shared/execution-preview-data-connector-model'
import { executionPreviewPlanFixture } from './execution-preview-test-fixtures'
import { runExecutionPreviewProposedPipeline } from './execution-preview-proposed-pipeline-runner'

const snapshot: ExecutionPreviewSanitizedSnapshot = {
  userId: 'user-1', tasks: [], objectives: [], schedules: [], sessions: [], apps: [], sites: [],
  settings: { engineV2Execution: true }, dateRange: { startDate: '2026-07-03', endDate: '2026-07-04' },
  warnings: [], confidence: 100,
  metadata: { source: 'read_only_store_snapshot', capturedAt: '2026-07-03T00:00:00.000Z', sanitizedAt: '2026-07-03T00:00:00.000Z' },
}

describe('runExecutionPreviewProposedPipeline', () => {
  it('runs with an injected pure final builder', () => {
    const result = runExecutionPreviewProposedPipeline({ snapshot, builders: { buildPreviewPlan: () => executionPreviewPlanFixture() } })
    expect(result.previewPlan?.id).toBe('preview-1')
    expect(result.errors).toEqual([])
  })

  it('returns partial when a required builder is missing', () => {
    const result = runExecutionPreviewProposedPipeline({ snapshot, builders: { buildPreviewPlan: null } })
    expect(result.mode).toBe('partial_preview')
    expect(result.errors.join(' ')).toContain('builder indisponible')
  })

  it('contains a builder exception instead of crashing the whole pipeline', () => {
    const result = runExecutionPreviewProposedPipeline({ snapshot, builders: { buildPreviewPlan: () => { throw new Error('controlled failure') } } })
    expect(result.mode).toBe('partial_preview')
    expect(result.errors.join(' ')).toContain('controlled failure')
  })

  it('returns unsafe for a missing userId', () => {
    const result = runExecutionPreviewProposedPipeline({ snapshot: { ...snapshot, userId: 'MISSING_USER_ID' } })
    expect(result.mode).toBe('unsafe')
  })

  it('keeps both application capabilities false with engineV2Execution=true', () => {
    const result = runExecutionPreviewProposedPipeline({ snapshot, builders: { buildPreviewPlan: () => executionPreviewPlanFixture() } })
    expect(result.canApplyPreview).toBe(false)
    expect(result.previewPlan?.readiness.canApplyLater).toBe(false)
  })
})
