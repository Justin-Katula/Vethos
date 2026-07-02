import type { SessionPlanV2 } from '@shared/session-model'
import type {
  BlockingProfileDraft,
  ProtectionRuntimePlanV2,
} from '@shared/runtime-coordinator-model'

export function buildBlockingProfileDraftFromSessionProtection(input: {
  sessionPlan: SessionPlanV2
  protectionRuntimePlan?: ProtectionRuntimePlanV2
  now?: string
}): BlockingProfileDraft {
  const { sessionPlan } = input
  const protection = input.protectionRuntimePlan ?? sessionPlan.protection

  const mode = protection.mode

  let draftMode: BlockingProfileDraft['mode'] = 'none'
  if (mode === 'strict_allowlist' || mode === 'allowlist' || mode === 'blocklist' || mode === 'none') {
    draftMode = mode
  } else {
    // If we have some unknown mode, fallback or map to manual_review
    draftMode = 'manual_review'
  }

  const allowApps = Array.from(new Set(protection.usefulApps))
  const blockApps = Array.from(new Set(protection.blockedApps))
  const allowSites = Array.from(new Set(protection.usefulSites))
  const blockSites = Array.from(new Set(protection.blockedSites))
  
  // Conditional apps are monitored or placed in conditional depending on capability
  const monitorApps = Array.from(new Set(protection.conditionalApps ?? []))
  const monitorSites = Array.from(new Set(protection.conditionalSites ?? []))

  // Map unlock policy
  let unlockPolicy: BlockingProfileDraft['unlockPolicy'] = 'none'
  if (protection.unlockPolicy) {
    if (protection.unlockPolicy === 'cooldown') {
      unlockPolicy = 'cooldown'
    } else if (protection.unlockPolicy === 'justification') {
      unlockPolicy = 'justification'
    } else if (protection.unlockPolicy === 'cooldown_and_justification') {
      unlockPolicy = 'cooldown_and_justification'
    } else if (protection.unlockPolicy === 'deny_during_strict_session') {
      unlockPolicy = 'deny_during_strict_session'
    } else {
      unlockPolicy = 'none'
    }
  }

  // Determine warnings and confidence
  const warnings: string[] = []
  let confidence = protection.confidence ?? 1.0

  if (
    (draftMode === 'allowlist' || draftMode === 'strict_allowlist') &&
    allowApps.length === 0 &&
    allowSites.length === 0
  ) {
    warnings.push('Allowlist vide refusée : repli sûr vers blocklist sans blocage global.')
    draftMode = 'blocklist'
    confidence *= 0.8
  }

  if (blockApps.length === 0 && blockSites.length === 0 && draftMode === 'blocklist') {
    warnings.push('Blocklist mode selected but no apps or sites are blocked')
    confidence *= 0.9
  }

  return {
    mode: draftMode,
    apps: {
      allow: allowApps,
      block: blockApps,
      monitorOnly: monitorApps,
      conditional: monitorApps,
    },
    sites: {
      allow: allowSites,
      block: blockSites,
      monitorOnly: monitorSites,
      conditional: monitorSites,
    },
    unlockPolicy,
    overlayBehavior: {
      preferredMethod: 'attached_overlay_existing_system',
      shouldCoverApps: true,
      shouldAvoidKillProcess: true,
      allowUserMinimizeFromOverlay: true,
      allowUserCloseFromOverlay: true,
    },
    mediaBehavior: {
      shouldMuteDistractingMedia: true,
      shouldPauseDistractingMedia: true,
      scope: 'target_app_only',
    },
    recoveryBehavior: {
      shouldPersistActiveSessionLater: true,
      shouldUseExistingHydrateFromDiskLater: true,
    },
    reasons: ['Adapted from SessionProtectionPlan'],
    warnings,
    confidence,
  }
}
