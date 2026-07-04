import { describe, it, expect } from 'vitest'
import { createPreviewPipelineTrace, appendPreviewPipelineStep } from './execution-preview-pipeline-trace'

describe('execution-preview-pipeline-trace', () => {
  it('creates an empty trace with 100 confidence', () => {
    const trace = createPreviewPipelineTrace()
    expect(trace.steps).toEqual([])
    expect(trace.failedStepIds).toEqual([])
    expect(trace.confidence).toBe(100)
  })

  it('appends a failed step and recalculates confidence', () => {
    const trace = createPreviewPipelineTrace()
    appendPreviewPipelineStep(trace, {
      id: 'step1',
      name: 'input_adaptation',
      status: 'failed',
      reason: 'test error',
      warnings: [],
      confidence: 40
    })
    expect(trace.failedStepIds).toContain('step1')
    expect(trace.confidence).toBe(40)
  })

  it('appends a warning step', () => {
    const trace = createPreviewPipelineTrace()
    appendPreviewPipelineStep(trace, {
      id: 'step2',
      name: 'dependency_resolution',
      status: 'success_with_warnings',
      reason: 'missing optional',
      warnings: ['missing user_model'],
      confidence: 80
    })
    expect(trace.warningStepIds).toContain('step2')
    expect(trace.confidence).toBe(80)
  })
})
