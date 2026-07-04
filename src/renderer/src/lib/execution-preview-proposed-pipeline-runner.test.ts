import { describe, it, expect } from 'vitest'
import { runExecutionPreviewProposedPipeline } from './execution-preview-proposed-pipeline-runner'
import type { ExecutionPreviewSanitizedSnapshot } from '@shared/execution-preview-data-connector-model'

describe('execution-preview-proposed-pipeline-runner', () => {
  const baseSanitized: ExecutionPreviewSanitizedSnapshot = {
    userId: 'user1',
    tasks: [],
    objectives: [],
    schedules: [],
    sessions: [],
    apps: [],
    sites: [],
    settings: { engineV2Execution: true },
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
    const res = runExecutionPreviewProposedPipeline({
      snapshot: { ...baseSanitized, userId: 'MISSING_USER_ID' }
    })
    expect(res.mode).toBe('unsafe')
    expect(res.errors.some(e => e.includes('userId manquant'))).toBe(true)
  })

  it('runs the pipeline and ensures canApplyLater remains false on the returned preview plan', () => {
    // Snapshot avec engineV2Execution=true : avant la correction du Point 10, ce chemin
    // produisait canApplyLater=true. La garantie structurelle exige false.
    const res = runExecutionPreviewProposedPipeline({
      snapshot: baseSanitized,
      idFactory: () => 'test-id'
    })
    expect(res.previewPlan).toBeDefined()
    expect(res.previewPlan!.readiness.canApplyLater).toBe(false)
  })
})
