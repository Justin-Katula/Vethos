import { describe, expect, it } from 'vitest'
import { executionPreviewPlanFixture } from './execution-preview-test-fixtures'
import { buildExecutionPreviewViewModel } from './execution-preview-view-model'

describe('buildExecutionPreviewViewModel', () => {
  it('returns empty without a plan', () => expect(buildExecutionPreviewViewModel({}).status).toBe('empty'))
  it('maps a complete structured preview', () => {
    const vm = buildExecutionPreviewViewModel({ previewPlan: executionPreviewPlanFixture() })
    expect(vm.hasPreview).toBe(true)
    expect(vm.status).toBe('ready')
    expect(vm.days[0]!.blocks[0]!.kindLabel).toBe('Travail profond')
  })
  it('maps partial preview', () => {
    const base = executionPreviewPlanFixture()
    expect(buildExecutionPreviewViewModel({ previewPlan: executionPreviewPlanFixture({ status: 'partial_preview', readiness: { ...base.readiness, readiness: 'partial_preview_only' } }) }).status).toBe('partial')
  })
  it('distinguishes unsafe and manual review', () => {
    const base = executionPreviewPlanFixture()
    expect(buildExecutionPreviewViewModel({ previewPlan: executionPreviewPlanFixture({ mode: 'unsafe', safety: { ...base.safety, status: 'unsafe' } }) }).status).toBe('unsafe')
    expect(buildExecutionPreviewViewModel({ previewPlan: executionPreviewPlanFixture({ mode: 'manual_review_required' }) }).status).toBe('manual_review')
  })
  it('keeps dangerous actions and rebuild_proposed disabled', () => {
    const actions = buildExecutionPreviewViewModel({ previewPlan: executionPreviewPlanFixture() }).actions
    for (const type of ['disabled_apply', 'disabled_start_session', 'disabled_blocking', 'rebuild_proposed']) expect(actions.find((action) => action.actionType === type)?.enabled).toBe(false)
  })
  it('maps confidence and explicit guard facts', () => {
    const vm = buildExecutionPreviewViewModel({ previewPlan: executionPreviewPlanFixture(), uiData: { value: 1 } })
    expect(vm.days[0]!.blocks[0]!.confidenceLabel).toBe('92%')
    expect(vm.guardFacts).toEqual(expect.objectContaining({ canApplyLater: false, realActionHandlerPresent: false, safetyStatus: 'safe' }))
  })
})
