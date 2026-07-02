import { describe, it, expect } from 'vitest'
import type { PreviewReadinessGateResult, ExecutionPreviewPlanV2 } from './execution-preview-model'

describe('execution-preview-model', () => {
  it('defines canApplyLater as literal false', () => {
    // Type test
    const readiness: PreviewReadinessGateResult = {
      canDisplayPreview: true,
      canApplyLater: false,
      readiness: 'ready_for_debug_preview',
      blockers: [],
      warnings: [],
      requiredActions: [],
      confidence: 100,
    }
    expect(readiness.canApplyLater).toBe(false)
  })

  it('ensures objects are fully serializable without classes or methods', () => {
    const dummyPlan: Partial<ExecutionPreviewPlanV2> = {
      id: 'test',
      status: 'ready_for_preview',
      mode: 'shadow_only',
    }
    const serialized = JSON.parse(JSON.stringify(dummyPlan))
    expect(serialized.id).toBe('test')
    expect(serialized.mode).toBe('shadow_only')
  })
})
