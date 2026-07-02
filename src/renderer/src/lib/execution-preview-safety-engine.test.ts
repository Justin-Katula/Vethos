import { describe, it, expect } from 'vitest'
import { runExecutionPreviewSafetyCheck } from './execution-preview-safety-engine'

describe('execution-preview-safety-engine', () => {
  it('detects canApplyLater true in input', () => {
    const report = runExecutionPreviewSafetyCheck({
      placementPlanV2: {
        canApplyLater: true
      }
    })
    expect(report.status).toBe('critical')
    expect(report.realActionDetected).toBe(true)
    expect(report.reasons.join('')).toContain('canApplyLater = true')
  })

  it('detects shouldApplyOutcomeToTaskStoreNow true', () => {
    const report = runExecutionPreviewSafetyCheck({
      sessionPlansV2: [
        { id: 's1', closure: { shouldApplyOutcomeToTaskStoreNow: true } }
      ]
    })
    expect(report.status).toBe('critical')
    expect(report.realActionDetected).toBe(true)
  })

  it('detects shouldAvoidKillProcess false', () => {
    const report = runExecutionPreviewSafetyCheck({
      runtimeCoordinatorPlansV2: [
        { id: 'r1', blockingProfileDraft: { overlayBehavior: { shouldAvoidKillProcess: false } } }
      ]
    })
    expect(report.status).toBe('critical')
    expect(report.realActionDetected).toBe(true)
  })

  it('detects unsafe runtime plan', () => {
    const report = runExecutionPreviewSafetyCheck({
      runtimeCoordinatorPlansV2: [
        { id: 'r1', safety: { status: 'critical' }, blockingProfileDraft: { overlayBehavior: { shouldAvoidKillProcess: true, preferredMethod: 'attached_overlay_existing_system' }, mediaBehavior: { scope: 'target_app_only' } } }
      ]
    })
    expect(report.status).toBe('unsafe')
    expect(report.unsafeRuntimePlans).toContain('r1')
  })

  it('detects real blocking control', () => {
    const report = runExecutionPreviewSafetyCheck({
      runtimeCoordinatorPlansV2: [
        { id: 'r1', metadata: { controlsBlocking: true } }
      ]
    })
    expect(report.status).toBe('critical')
    expect(report.realActionDetected).toBe(true)
  })
})
