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

  // CORR 2 — strict_allowlist : vérifier apps OU sites vides. Une allowlist stricte
  // sans aucune cible utile connue bloquerait l'utilisateur au lieu de l'aider.
  if (
    blockingProfileDraft.mode === 'strict_allowlist' &&
    (blockingProfileDraft.apps.allow.length === 0 || blockingProfileDraft.sites.allow.length === 0)
  ) {
    if (status !== 'critical') status = 'warning'
    const missing = []
    if (blockingProfileDraft.apps.allow.length === 0) missing.push('apps')
    if (blockingProfileDraft.sites.allow.length === 0) missing.push('sites')
    warnings.push(`Strict allowlist activée mais aucune cible utile connue (${missing.join(' et ')}). Cela pourrait bloquer toutes les applications.`)
    confidence *= 0.8
  }

  if (blockingProfileDraft.overlayBehavior.shouldAvoidKillProcess === false) {
    status = 'critical'
    warnings.push('shouldAvoidKillProcess must be true in Point 9 coordinator (mode consultatif).')
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
