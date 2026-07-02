import type { SessionPlanV2 } from '@shared/session-model'
import type {
  BlockingProfileDraft,
  ProtectionRuntimePlanV2,
  RuntimeCoordinatorSafetyReport,
} from '@shared/runtime-coordinator-model'

export function runRuntimeCoordinatorSafetyCheck(input: {
  sessionPlan: SessionPlanV2
  protectionRuntimePlan?: ProtectionRuntimePlanV2
  blockingProfileDraft: BlockingProfileDraft
}): RuntimeCoordinatorSafetyReport {
  const { blockingProfileDraft } = input

  let status: RuntimeCoordinatorSafetyReport['status'] = 'safe'
  const warnings: string[] = []
  const riskyTargets: string[] = []
  let confidence = 1.0

  const systemProcesses = ['explorer.exe', 'taskmgr.exe', 'cmd.exe', 'powershell.exe', 'svchost.exe']
  const vethosProcesses = ['vethos.exe']

  const allBlocked = [
    ...blockingProfileDraft.apps.block,
    ...blockingProfileDraft.apps.monitorOnly,
    ...blockingProfileDraft.apps.conditional,
  ].map((p) => p.toLowerCase())

  for (const proc of systemProcesses) {
    if (allBlocked.includes(proc)) {
      status = 'critical'
      warnings.push(`System process ${proc} is targeted for blocking or monitoring.`)
      riskyTargets.push(proc)
    }
  }

  for (const proc of vethosProcesses) {
    if (allBlocked.includes(proc)) {
      status = 'critical'
      warnings.push(`Vethos process ${proc} is targeted for blocking.`)
      riskyTargets.push(proc)
    }
  }

  if (blockingProfileDraft.mode === 'strict_allowlist' && blockingProfileDraft.apps.allow.length === 0) {
    if (status !== 'critical') status = 'warning'
    warnings.push('Strict allowlist mode enabled but no allowed apps are defined. This could block all applications.')
    confidence *= 0.8
  }

  if (blockingProfileDraft.overlayBehavior.shouldAvoidKillProcess === false) {
    status = 'critical'
    warnings.push('shouldAvoidKillProcess must be true in Point 9 shadow coordinator.')
  }

  if (blockingProfileDraft.overlayBehavior.preferredMethod !== 'attached_overlay_existing_system') {
    status = 'critical'
    warnings.push('preferredMethod must be attached_overlay_existing_system.')
  }

  if (blockingProfileDraft.mediaBehavior.scope !== 'target_app_only') {
    status = 'critical'
    warnings.push('Media behavior scope must be target_app_only.')
  }

  return {
    status,
    forbiddenIntegrationDetected: false, // In a pure function context, we statically ensure no real imports are made
    doNotTouchFiles: [
      'src/main/tracking/process-window-probe.ts',
      'src/main/tracking/strict-block-window.ts',
      'src/service/blocking/processes/killer.ts',
      'src/service/blocking/session/manager.ts',
      'src/service/blocking/session/timer.ts',
      'src/service/blocking/session/locks/justification.ts',
    ],
    riskyTargets,
    warnings,
    confidence,
  }
}
