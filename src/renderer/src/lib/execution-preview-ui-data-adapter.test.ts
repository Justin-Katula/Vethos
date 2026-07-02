import { describe, it, expect } from 'vitest'
import { buildExecutionPreviewUiData } from './execution-preview-ui-data-adapter'
import type { ExecutionPreviewPlanV2 } from '@shared/execution-preview-model'

describe('execution-preview-ui-data-adapter', () => {
  const basePlan = {
    explanation: { title: 'T', summary: 'S', warnings: [], keyDecisions: [], nextRecommendedAction: 'show_ui_preview', confidence: 100 },
    status: 'ready_for_preview',
    days: [],
    readiness: { readiness: 'ready_for_ui_preview' }
  } as unknown as ExecutionPreviewPlanV2

  it('generates ui data and disables apply action', () => {
    const data = buildExecutionPreviewUiData(basePlan)
    const applyAction = data.actions.find(a => a.actionType === 'disabled_apply')
    expect(applyAction).toBeDefined()
    expect(applyAction?.enabled).toBe(false)
    expect(applyAction?.reason).toContain('shadow and preview-only')
  })

  it('adds manual_review action if required', () => {
    const data = buildExecutionPreviewUiData({
      ...basePlan,
      readiness: { readiness: 'manual_review_required' } as any
    })
    const reviewAction = data.actions.find(a => a.actionType === 'manual_review')
    expect(reviewAction).toBeDefined()
    expect(reviewAction?.enabled).toBe(true)
  })
})
