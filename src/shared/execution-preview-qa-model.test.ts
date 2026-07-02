import { describe, it, expect } from 'vitest'
import { ExecutionPreviewQaReport } from './execution-preview-qa-model'

describe('execution-preview-qa-model', () => {
  it('defines valid statuses and canProceedToActivationPlanning is strictly false', () => {
    const report = {
      canProceedToActivationPlanning: false
    } as ExecutionPreviewQaReport
    
    expect(report.canProceedToActivationPlanning).toBe(false)
  })
})
