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

  it('garantit canApplyLater=false même avec engineV2Execution=true et readiness saine', () => {
    // C'est le test qui couvrait le trou : avant la correction, ce chemin produisait
    // canApplyLater=true en production (engineV2Execution=true par défaut dans le
    // settings store + readiness saine). La garantie structurelle du Point 10 exige
    // false sans condition.
    const res = runExecutionPreviewReadinessGate({
      ...baseInput,
      settings: { engineV2Execution: true },
    })
    expect(res.readiness).toBe('ready_for_ui_preview')
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
