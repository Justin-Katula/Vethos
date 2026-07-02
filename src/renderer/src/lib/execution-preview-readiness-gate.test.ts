import { describe, it, expect } from 'vitest'
import { runExecutionPreviewReadinessGate } from './execution-preview-readiness-gate'

describe('execution-preview-readiness-gate', () => {
  const baseInput = {
    dependencies: [],
    days: [],
    safety: { status: 'safe', realActionDetected: false, forbiddenDependencyDetected: false, unsafeRuntimePlans: [], warnings: [], reasons: [], confidence: 100 } as any,
  }

  it('enforces canApplyLater as literal false', () => {
    const res = runExecutionPreviewReadinessGate(baseInput)
    expect(res.canApplyLater).toBe(false)
  })

  it('marks as unsafe if safety check is critical', () => {
    const res = runExecutionPreviewReadinessGate({
      ...baseInput,
      safety: { ...baseInput.safety, status: 'critical' }
    })
    expect(res.readiness).toBe('unsafe')
    expect(res.canDisplayPreview).toBe(false)
  })

  it('allows partial preview if placement plan exists but others missing', () => {
    const res = runExecutionPreviewReadinessGate({
      ...baseInput,
      dependencies: [
        { name: 'placement_plan', status: 'available', required: true } as any,
        { name: 'session_plans', status: 'missing', required: true } as any
      ]
    })
    expect(res.readiness).toBe('partial_preview_only')
    expect(res.canDisplayPreview).toBe(true)
  })

  it('blocks if placement plan is entirely missing', () => {
    const res = runExecutionPreviewReadinessGate({
      ...baseInput,
      dependencies: [
        { name: 'placement_plan', status: 'missing', required: true } as any,
      ]
    })
    expect(res.readiness).toBe('blocked')
    expect(res.canDisplayPreview).toBe(false)
  })
})
