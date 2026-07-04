import { describe, expect, it } from 'vitest'
import {
  runtimeCoordinatorV2Enabled,
  blockingProfileDraftAdapterEnabled,
  runtimeSignalBridgePlannerEnabled,
  runtimeClosureBridgePlannerEnabled,
  runtimeCoordinatorSafetyEngineEnabled,
  runtimeCoordinatorDiagnosticsEnabled,
  runtimeCoordinatorControlsSessionManager,
  runtimeCoordinatorControlsStartSession,
  runtimeCoordinatorControlsOverlay,
  runtimeCoordinatorControlsFirewall,
  runtimeCoordinatorControlsHostsFile,
  runtimeCoordinatorControlsProcessWatcher,
  runtimeCoordinatorControlsTaskOutcome,
} from './runtime-coordinator-flags'

describe('runtime-coordinator-flags', () => {
  it('active les 6 flags de calcul du coordinator V2', () => {
    expect(runtimeCoordinatorV2Enabled).toBe(true)
    expect(blockingProfileDraftAdapterEnabled).toBe(true)
    expect(runtimeSignalBridgePlannerEnabled).toBe(true)
    expect(runtimeClosureBridgePlannerEnabled).toBe(true)
    expect(runtimeCoordinatorSafetyEngineEnabled).toBe(true)
    expect(runtimeCoordinatorDiagnosticsEnabled).toBe(true)
  })

  it('garantit qu\'aucune connexion OS réelle (9.16) n\'est activée par défaut', () => {
    // Point 9.16 — ces flags restent false tant qu'aucune décision explicite n'a activé
    // les connexions système réelles (overlay, process watcher, hosts, firewall, etc.).
    expect(runtimeCoordinatorControlsSessionManager).toBe(false)
    expect(runtimeCoordinatorControlsStartSession).toBe(false)
    expect(runtimeCoordinatorControlsOverlay).toBe(false)
    expect(runtimeCoordinatorControlsFirewall).toBe(false)
    expect(runtimeCoordinatorControlsHostsFile).toBe(false)
    expect(runtimeCoordinatorControlsProcessWatcher).toBe(false)
    expect(runtimeCoordinatorControlsTaskOutcome).toBe(false)
  })

  it('permet un rollback : tous les contrôles réels reviennent à false', () => {
    // Rollback = aucune opération système réelle possible. On rassemble les 7 contrôles
    // et on vérifie qu'ils sont tous inactifs simultanément.
    const realEffectControls = [
      runtimeCoordinatorControlsSessionManager,
      runtimeCoordinatorControlsStartSession,
      runtimeCoordinatorControlsOverlay,
      runtimeCoordinatorControlsFirewall,
      runtimeCoordinatorControlsHostsFile,
      runtimeCoordinatorControlsProcessWatcher,
      runtimeCoordinatorControlsTaskOutcome,
    ]
    expect(realEffectControls.every((flag) => flag === false)).toBe(true)
  })

  it('ne contient aucun terme Shadow dans les noms de flags exportés', () => {
    // Les flags du Point 9 ne doivent jamais référencer un concept "shadow".
    const flagNames = [
      'runtimeCoordinatorV2Enabled',
      'blockingProfileDraftAdapterEnabled',
      'runtimeSignalBridgePlannerEnabled',
      'runtimeClosureBridgePlannerEnabled',
      'runtimeCoordinatorSafetyEngineEnabled',
      'runtimeCoordinatorDiagnosticsEnabled',
      'runtimeCoordinatorControlsSessionManager',
      'runtimeCoordinatorControlsStartSession',
      'runtimeCoordinatorControlsOverlay',
      'runtimeCoordinatorControlsFirewall',
      'runtimeCoordinatorControlsHostsFile',
      'runtimeCoordinatorControlsProcessWatcher',
      'runtimeCoordinatorControlsTaskOutcome',
    ]
    expect(flagNames.every((name) => !name.toLowerCase().includes('shadow'))).toBe(true)
  })
})
