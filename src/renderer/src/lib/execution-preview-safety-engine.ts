import type { PreviewSafetyReport, ExecutionPreviewDay } from '@shared/execution-preview-model'

export function runExecutionPreviewSafetyCheck(input: {
  placementPlanV2?: any
  sessionPlansV2?: any[]
  runtimeCoordinatorPlansV2?: any[]
  days?: ExecutionPreviewDay[]
}): PreviewSafetyReport {
  let status: PreviewSafetyReport['status'] = 'safe'
  let realActionDetected = false
  let forbiddenDependencyDetected = false
  const unsafeRuntimePlans: string[] = []
  const warnings: string[] = []
  const reasons: string[] = []
  let confidence = 100

  // Inspect Session Plans
  if (input.sessionPlansV2) {
    for (const session of input.sessionPlansV2) {
      if (session.metadata?.realActionDetected || session.metadata?.controlsStartSession) {
        realActionDetected = true
        status = 'critical'
        reasons.push(`Session ${session.id} contains real action controls.`)
      }
      if (session.closure?.shouldApplyOutcomeToTaskStoreNow === true || session.outcome?.shouldApplyOutcomeToTaskStoreNow === true) {
        realActionDetected = true
        status = 'critical'
        reasons.push(`Session ${session.id} attempts to mutate TaskStore.`)
      }
    }
  }

  // Inspect Runtime Coordinator Plans
  if (input.runtimeCoordinatorPlansV2) {
    for (const runtime of input.runtimeCoordinatorPlansV2) {
      if (runtime.safety?.status === 'critical') {
        unsafeRuntimePlans.push(runtime.id)
        if (status !== 'critical') status = 'unsafe'
        reasons.push(`Runtime Coordinator Plan ${runtime.id} is critical.`)
      }
      if (runtime.blockingProfileDraft?.overlayBehavior?.shouldAvoidKillProcess === false) {
        realActionDetected = true
        status = 'critical'
        reasons.push(`Runtime Coordinator Plan ${runtime.id} allows process killing.`)
      }
      if (runtime.blockingProfileDraft?.overlayBehavior?.preferredMethod !== 'attached_overlay_existing_system') {
        status = 'critical'
        reasons.push(`Runtime Coordinator Plan ${runtime.id} uses an invalid overlay method.`)
      }
      if (runtime.blockingProfileDraft?.mediaBehavior?.scope !== 'target_app_only') {
        status = 'critical'
        reasons.push(`Runtime Coordinator Plan ${runtime.id} uses global media scope.`)
      }
      // Controls
      if (runtime.metadata?.controlsBlocking) {
        realActionDetected = true
        status = 'critical'
        reasons.push(`Runtime Coordinator Plan ${runtime.id} attempts to control real blocking.`)
      }
    }
  }

  // Inspect general input for any object with canApplyLater: true
  try {
    const stringified = JSON.stringify(input)
    if (stringified.includes('"canApplyLater":true')) {
      realActionDetected = true
      status = 'critical'
      reasons.push('canApplyLater = true detected in input payloads.')
    }
    if (stringified.includes('"shouldApplyOutcomeToTaskStoreNow":true')) {
      realActionDetected = true
      status = 'critical'
      reasons.push('shouldApplyOutcomeToTaskStoreNow = true detected in input payloads.')
    }
  } catch (e) {
    warnings.push('Could not stringify input to check deep properties.')
    confidence -= 20
  }

  if (realActionDetected) {
    confidence = 0
  }

  return {
    status,
    realActionDetected,
    forbiddenDependencyDetected,
    unsafeRuntimePlans,
    warnings,
    reasons,
    confidence
  }
}
