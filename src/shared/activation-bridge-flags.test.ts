import { describe, it, expect } from 'vitest'
import { activationBridgeFlags } from './activation-bridge-flags'

describe('activation-bridge-flags', () => {
  it('enables bridge rendering features', () => {
    expect(activationBridgeFlags.activationBridgeEnabled).toBe(true)
    expect(activationBridgeFlags.activationBridgeUiEnabled).toBe(true)
  })

  it('forces all control, apply, and write flags to strictly false', () => {
    expect(activationBridgeFlags.activationBridgeControlsRealActivation).toBe(false)
    expect(activationBridgeFlags.activationBridgeControlsApplyPlanning).toBe(false)
    expect(activationBridgeFlags.activationBridgeControlsCreateSessions).toBe(false)
    expect(activationBridgeFlags.activationBridgeControlsStartSessions).toBe(false)
    expect(activationBridgeFlags.activationBridgeControlsBlocking).toBe(false)
    expect(activationBridgeFlags.activationBridgeControlsTaskCompletion).toBe(false)
    expect(activationBridgeFlags.activationBridgeControlsPersistContract).toBe(false)
    expect(activationBridgeFlags.activationBridgeControlsPersistReview).toBe(false)
    expect(activationBridgeFlags.activationBridgeControlsLocalStorage).toBe(false)
    expect(activationBridgeFlags.activationBridgeControlsStoreWrites).toBe(false)
    expect(activationBridgeFlags.activationBridgeControlsAutoExecute).toBe(false)
    expect(activationBridgeFlags.activationBridgeControlsIpc).toBe(false)
    expect(activationBridgeFlags.activationBridgeControlsElectronMain).toBe(false)
  })
})
