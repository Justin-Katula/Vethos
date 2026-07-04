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

  // CORR 1 — Résolution des contradictions allow/block (Point 9.7).
  // Une même cible ne doit jamais être à la fois autorisée et bloquée.
  // NOTE : la priorité "correction utilisateur forte" du prompt n'est pas applicable
  // ici car le SessionProtectionPlan ne transporte pas de métadonnée de source sur
  // chaque cible. On applique donc la résolution par mode, qui correspond aux règles
  // 2-4 du prompt : utile pour la session > distraction critique > sinon retrait.
  const resolveContradictions = (
    allow: string[],
    block: string[],
    kind: 'app' | 'site',
  ): { allow: string[]; block: string[] } => {
    const allowLower = new Set(allow.map((t) => t.toLowerCase()))
    const conflicts = block.filter((t) => allowLower.has(t.toLowerCase()))
    if (conflicts.length === 0) return { allow, block }

    if (draftMode === 'allowlist' || draftMode === 'strict_allowlist') {
      // Allow gagne : la cible est utile à la session active.
      const blockSet = new Set(block.map((t) => t.toLowerCase()))
      const nextBlock = block.filter((t) => !blockSet.has(t.toLowerCase()) || !allowLower.has(t.toLowerCase()))
      for (const c of conflicts) warnings.push(`Conflit ${kind} résolu en faveur de allow : ${c}.`)
      return { allow, block: nextBlock }
    }
    if (draftMode === 'blocklist') {
      // Block gagne : la cible est une distraction critique.
      const nextAllow = allow.filter((t) => !allowLower.has(t.toLowerCase()) || !block.includes(t))
      const blockLower = new Set(block.map((t) => t.toLowerCase()))
      for (const c of conflicts) warnings.push(`Conflit ${kind} résolu en faveur de block : ${c}.`)
      return { allow: nextAllow, block: Array.from(new Set([...nextAllow.map((t) => t.toLowerCase()), ...blockLower])) }
    }
    // Mode none : conflit non résolu, on retire la cible des deux listes.
    const conflictLower = new Set(conflicts.map((t) => t.toLowerCase()))
    for (const c of conflicts) warnings.push(`Conflit ${kind} non résolu, cible ignorée : ${c}.`)
    return {
      allow: allow.filter((t) => !conflictLower.has(t.toLowerCase())),
      block: block.filter((t) => !conflictLower.has(t.toLowerCase())),
    }
  }

  const resolvedApps = resolveContradictions(allowApps, blockApps, 'app')
  const resolvedSites = resolveContradictions(allowSites, blockSites, 'site')
  const finalAllowApps = resolvedApps.allow
  const finalBlockApps = resolvedApps.block
  const finalAllowSites = resolvedSites.allow
  const finalBlockSites = resolvedSites.block

  // CORR 2 — strict_allowlist vide : vérifier apps OU sites.
  // Une allowlist stricte sans aucune cible utile connue (apps ou sites) bloquerait
  // l'utilisateur au lieu de l'aider. On repli vers blocklist dès que l'une des deux
  // catégories est vide.
  if (
    (draftMode === 'allowlist' || draftMode === 'strict_allowlist') &&
    (finalAllowApps.length === 0 || finalAllowSites.length === 0)
  ) {
    warnings.push('Allowlist vide refusée : repli sûr vers blocklist sans blocage global.')
    draftMode = 'blocklist'
    confidence *= 0.8
  }

  if (finalBlockApps.length === 0 && finalBlockSites.length === 0 && draftMode === 'blocklist') {
    warnings.push('Blocklist mode selected but no apps or sites are blocked')
    confidence *= 0.9
  }

  return {
    mode: draftMode,
    apps: {
      allow: finalAllowApps,
      block: finalBlockApps,
      monitorOnly: monitorApps,
      conditional: monitorApps,
    },
    sites: {
      allow: finalAllowSites,
      block: finalBlockSites,
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
