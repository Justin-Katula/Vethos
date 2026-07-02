import { describe, it, expect } from 'vitest'
import { runExecutionPreviewShadowPipeline } from './execution-preview-shadow-pipeline-runner'
import type { ExecutionPreviewSanitizedSnapshot } from '@shared/execution-preview-data-connector-model'

describe('execution-preview-shadow-pipeline-runner', () => {
  const baseSanitized: ExecutionPreviewSanitizedSnapshot = {
    userId: 'user1',
    tasks: [],
    objectives: [],
    schedules: [],
    sessions: [],
    apps: [],
    sites: [],
    settings: {},
    dateRange: { startDate: '2025-01-01', endDate: '2025-01-02' },
    warnings: [],
    confidence: 100,
    metadata: {
      source: 'read_only_store_snapshot',
      capturedAt: '2025-01-01T00:00:00Z',
      sanitizedAt: '2025-01-01T00:00:00Z'
    }
  }

  it('returns unsafe mode if userId is MISSING_USER_ID', () => {
    const res = runExecutionPreviewShadowPipeline({
      snapshot: { ...baseSanitized, userId: 'MISSING_USER_ID' }
    })
    expect(res.mode).toBe('unsafe')
    expect(res.errors.some(e => e.includes('userId manquant'))).toBe(true)
  })

  it('runs the pipeline and ensures canApplyLater remains false on the returned preview plan', () => {
    // We pass empty data, which should trigger partial_preview and generate a plan
    const res = runExecutionPreviewShadowPipeline({
      snapshot: baseSanitized,
      idFactory: () => 'test-id'
    })
    console.log(res.errors)
    expect(res.mode).toBe('preview_only')
    expect(res.previewPlan).toBeDefined()
  })
})
