import { describe, it, expect } from 'vitest'
import { buildManualReviewViewModel } from './manual-review-view-model'
import { buildManualReviewDraft } from './manual-review-draft-builder'

describe('buildManualReviewViewModel', () => {
  it('enforces safe actions only', () => {
    const draft = buildManualReviewDraft({ previewPlan: { id: '1', days: [] } })
    const vm = buildManualReviewViewModel({ draft })

    expect(vm.actions.some(a => a.dangerous)).toBe(false)
    expect(vm.canApplyAnything).toBe(false)
    expect(vm.canProceedToActivationBridge).toBe(false)

    const forbiddenWords = ['apply', 'start', 'block', 'autofix']
    vm.actions.forEach(a => {
      forbiddenWords.forEach(w => {
        expect(a.actionType.toLowerCase()).not.toContain(w)
      })
    })
  })

  it('maps block rows', () => {
    const draft = buildManualReviewDraft({ previewPlan: { id: '1', days: [{ blocks: [{ id: 'b1' }] }] } })
    draft.blockDecisions.push({ blockId: 'b1', decision: 'accepted_in_principle', createdAt: '' })

    const vm = buildManualReviewViewModel({ draft, previewPlan: { days: [{ blocks: [{ id: 'b1' }] }] } })
    expect(vm.blockRows.length).toBe(1)
    expect(vm.blockRows[0]!.decisionLabel).toBe('Accepté')
    expect(vm.blockRows[0]!.decisionSeverity).toBe('good')
  })
})
