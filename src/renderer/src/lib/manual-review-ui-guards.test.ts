import { describe, it, expect } from 'vitest'
import { guardManualReviewUi } from './manual-review-ui-guards'
import { ManualReviewViewModel } from './manual-review-view-model'

describe('guardManualReviewUi', () => {
  const baseVm: ManualReviewViewModel = {
    statusLabel: 'Test',
    statusSeverity: 'neutral',
    summaryCards: [],
    blockRows: [],
    actions: [],
    warnings: [],
    blockers: [],
    canApplyAnything: false,
    canProceedToActivationBridge: false
  }

  it('detects canApplyAnything true', () => {
    const res = guardManualReviewUi({ ...baseVm, canApplyAnything: true as any })
    expect(res.safe).toBe(false)
  })

  it('detects dangerous action', () => {
    const res = guardManualReviewUi({ 
      ...baseVm, 
      actions: [{ label: 'ok', actionType: 'approve_preview_in_principle', targetType: 'preview', enabled: true, dangerous: true as any, reason: '' }] 
    })
    expect(res.safe).toBe(false)
  })

  it('detects forbidden words in label', () => {
    const res = guardManualReviewUi({ 
      ...baseVm, 
      actions: [{ label: 'Appliquer plan', actionType: 'approve_preview_in_principle', targetType: 'preview', enabled: true, dangerous: false, reason: '' }] 
    })
    expect(res.safe).toBe(false)
    expect(res.issues.some(i => i.id === 'guard_forbidden_label')).toBe(true)
  })

  it('passes safe view model', () => {
    const res = guardManualReviewUi(baseVm)
    expect(res.safe).toBe(true)
  })
})
