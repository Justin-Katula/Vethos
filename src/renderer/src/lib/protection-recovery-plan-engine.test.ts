import { describe, expect, it } from 'vitest'
import { buildProtectionRecoveryPlan } from './protection-recovery-plan-engine'
import type {
  BlockingProfileDraft,
  RuntimeCoordinatorSafetyReport,
} from '@shared/runtime-coordinator-model'

function baseDraft(overrides: Partial<BlockingProfileDraft> = {}): BlockingProfileDraft {
  return {
    mode: 'blocklist',
    apps: { allow: [], block: [], monitorOnly: [], conditional: [] },
    sites: { allow: [], block: [], monitorOnly: [], conditional: [] },
    unlockPolicy: 'none',
    overlayBehavior: {
      preferredMethod: 'attached_overlay_existing_system',
      shouldCoverApps: false,
      shouldAvoidKillProcess: true,
      allowUserMinimizeFromOverlay: true,
      allowUserCloseFromOverlay: true,
    },
    mediaBehavior: {
      shouldMuteDistractingMedia: false,
      shouldPauseDistractingMedia: false,
      scope: 'target_app_only',
    },
    recoveryBehavior: {
      shouldPersistActiveSessionLater: false,
      shouldUseExistingHydrateFromDiskLater: false,
    },
    reasons: [],
    warnings: [],
    confidence: 1.0,
    ...overrides,
  }
}

const safeSafety: RuntimeCoordinatorSafetyReport = {
  status: 'safe',
  forbiddenIntegrationDetected: false,
  doNotTouchFiles: [],
  riskyTargets: [],
  warnings: [],
  confidence: 1.0,
}

describe('protection-recovery-plan-engine (Point 9.10)', () => {
  it('retourne none quand aucune règle système n\'est présente', () => {
    const plan = buildProtectionRecoveryPlan({
      blockingProfileDraft: baseDraft(),
      safety: safeSafety,
    })
    expect(plan.required).toBe(false)
    expect(plan.rollbackStrategy).toBe('none')
    expect(plan.rulesToRestore).toHaveLength(0)
  })

  it('retourne clear_session_rules quand des règles système sont présentes (sites bloqués)', () => {
    const draft = baseDraft({ sites: { allow: [], block: ['youtube.com'], monitorOnly: [], conditional: [] } })
    const plan = buildProtectionRecoveryPlan({ blockingProfileDraft: draft, safety: safeSafety })
    expect(plan.required).toBe(true)
    expect(plan.rollbackStrategy).toBe('clear_session_rules')
    expect(plan.rulesToRestore).toContain('hosts_plan')
  })

  it('détecte les règles process/firewall quand des apps sont bloquées', () => {
    const draft = baseDraft({ apps: { allow: [], block: ['discord.exe'], monitorOnly: [], conditional: [] } })
    const plan = buildProtectionRecoveryPlan({ blockingProfileDraft: draft, safety: safeSafety })
    expect(plan.required).toBe(true)
    expect(plan.rulesToRestore).toContain('process_plan')
  })

  it('exige manual_recovery quand le safety report est critical', () => {
    const draft = baseDraft({ apps: { allow: [], block: ['discord.exe'], monitorOnly: [], conditional: [] } })
    const criticalSafety: RuntimeCoordinatorSafetyReport = { ...safeSafety, status: 'critical' }
    const plan = buildProtectionRecoveryPlan({ blockingProfileDraft: draft, safety: criticalSafety })
    expect(plan.required).toBe(true)
    expect(plan.rollbackStrategy).toBe('manual_recovery')
  })

  it('reste consultatif : aucun appel OS réel (juste un plan de données)', () => {
    // Le moteur ne fait que retourner un objet. Aucun import de service IPC, hosts,
    // firewall ou process n'existe dans le fichier source. On vérifie ici que la
    // sortie est un pur objet de données.
    const plan = buildProtectionRecoveryPlan({
      blockingProfileDraft: baseDraft({
        overlayBehavior: { ...baseDraft().overlayBehavior, shouldCoverApps: true },
      }),
      safety: safeSafety,
    })
    expect(typeof plan).toBe('object')
    expect(plan.required).toBe(true)
    expect(plan.rulesToRestore).toContain('overlay_plan')
  })
})
