import type {
  BlockingProfileDraft,
  ProtectionRecoveryPlan,
  RuntimeCoordinatorSafetyReport,
} from '@shared/runtime-coordinator-model'

/**
 * Construit le plan de récupération système (Point 9.10).
 *
 * Détermine comment restaurer l'état système si le blocage réel (overlay/hosts/firewall/
 * process) est appliqué puis doit être annulé. Plan *consultatif* : aucune sauvegarde
 * système réelle n'est créée ici — seulement la stratégie de rollback.
 *
 * Règles :
 *  - safety critical → manual_recovery (l'automatisation n'est pas sûre)
 *  - règles système présentes (overlay/hosts/firewall/process) → clear_session_rules
 *  - sinon → none (rien à restaurer)
 */
export function buildProtectionRecoveryPlan(input: {
  blockingProfileDraft: BlockingProfileDraft
  safety: RuntimeCoordinatorSafetyReport
  now?: string
}): ProtectionRecoveryPlan {
  const { blockingProfileDraft, safety } = input

  // Un rollback manuel est exigé si le safety report est critical : on ne fait
  // confiance à aucune automatisation quand la sécurité système est compromise.
  if (safety.status === 'critical') {
    return {
      required: true,
      rollbackStrategy: 'manual_recovery',
      rulesToRestore: [],
      reasons: ['Safety report critical : récupération manuelle exigée, automatisation non sûre.'],
      warnings: ['Le plan de blocage présentait un risque critique ; ne pas restaurer automatiquement.'],
      confidence: 1.0,
    }
  }

  // Identifie les règles système présentes dans le brouillon. Les "règles système"
  // sont celles qui toucheraient l'OS : overlay, hosts, firewall, process watcher.
  // Ici le BlockingProfileDraft ne porte pas d'identifiants de règles explicites,
  // donc on reconstruit une liste de descripteurs à partir des cibles concernées.
  const rulesToRestore: string[] = []

  // Overlay : si le brouillon prévoit un overlay, c'est une couche système à restaurer.
  if (blockingProfileDraft.overlayBehavior.shouldCoverApps) {
    rulesToRestore.push('overlay_plan')
  }

  // Media control : couche système (volume/contrôle media).
  if (blockingProfileDraft.mediaBehavior.shouldMuteDistractingMedia) {
    rulesToRestore.push('media_control_plan')
  }

  // Sites bloqués → mapperait vers hosts_plan une fois 9.16 activé.
  if (blockingProfileDraft.sites.block.length > 0) {
    rulesToRestore.push('hosts_plan')
  }

  // Apps bloquées → mapperait vers process_plan/firewall_plan une fois 9.16 activé.
  if (blockingProfileDraft.apps.block.length > 0) {
    rulesToRestore.push('process_plan')
  }

  if (rulesToRestore.length === 0) {
    return {
      required: false,
      rollbackStrategy: 'none',
      rulesToRestore: [],
      reasons: ['Aucune règle système à restaurer (ni overlay, hosts, firewall, ni process).'],
      warnings: [],
      confidence: 1.0,
    }
  }

  return {
    required: true,
    rollbackStrategy: 'clear_session_rules',
    rulesToRestore,
    reasons: [
      `${rulesToRestore.length} règle(s) système détectée(s) (${rulesToRestore.join(', ')}). Le rollback effacera les règles de session appliquées.`,
    ],
    warnings: [
      'Stratégie consultative : aucune règle système réelle n\'est appliquée tant que les runtimeCoordinatorControls* restent false.',
    ],
    confidence: 0.9,
  }
}
