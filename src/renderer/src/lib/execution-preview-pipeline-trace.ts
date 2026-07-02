import type { PreviewPipelineStep, PreviewPipelineTrace } from '@shared/execution-preview-model'

export function createPreviewPipelineTrace(initialSteps: PreviewPipelineStep[] = []): PreviewPipelineTrace {
  const trace: PreviewPipelineTrace = {
    steps: [...initialSteps],
    failedStepIds: initialSteps.filter(s => s.status === 'failed').map(s => s.id),
    warningStepIds: initialSteps.filter(s => s.status === 'success_with_warnings').map(s => s.id),
    confidence: 100
  }
  recalculateConfidence(trace)
  return trace
}

export function appendPreviewPipelineStep(trace: PreviewPipelineTrace, step: PreviewPipelineStep): void {
  trace.steps.push(step)
  if (step.status === 'failed') {
    trace.failedStepIds.push(step.id)
  }
  if (step.status === 'success_with_warnings' || step.status === 'manual_review_required') {
    trace.warningStepIds.push(step.id)
  }
  recalculateConfidence(trace)
}

function recalculateConfidence(trace: PreviewPipelineTrace): void {
  let minConfidence = 100
  for (const step of trace.steps) {
    if (step.confidence < minConfidence) {
      minConfidence = step.confidence
    }
  }
  trace.confidence = minConfidence
}
