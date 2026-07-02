import { describe, it, expect } from 'vitest'
import { manualReviewGateFlags } from './manual-review-gate-flags'

describe('manual-review-gate-flags', () => {
  it('enables review flags', () => {
    expect(manualReviewGateFlags.manualReviewGateEnabled).toBe(true)
    expect(manualReviewGateFlags.manualReviewUiEnabled).toBe(true)
    expect(manualReviewGateFlags.manualReviewLocalStateEnabled).toBe(true)
  })

  it('disables ALL control, apply and write flags', () => {
    expect(manualReviewGateFlags.manualReviewControlsPersistReview).toBe(false)
    expect(manualReviewGateFlags.manualReviewControlsApplyPlanning).toBe(false)
    expect(manualReviewGateFlags.manualReviewControlsCreateSessions).toBe(false)
    expect(manualReviewGateFlags.manualReviewControlsStartSessions).toBe(false)
    expect(manualReviewGateFlags.manualReviewControlsBlocking).toBe(false)
    expect(manualReviewGateFlags.manualReviewControlsTaskCompletion).toBe(false)
    expect(manualReviewGateFlags.manualReviewControlsActivationBridge).toBe(false)
    expect(manualReviewGateFlags.manualReviewControlsAutoFix).toBe(false)
    expect(manualReviewGateFlags.manualReviewControlsLocalStorage).toBe(false)
    expect(manualReviewGateFlags.manualReviewControlsStoreWrites).toBe(false)
  })
})
