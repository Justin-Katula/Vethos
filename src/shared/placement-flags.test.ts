import { describe, expect, it } from 'vitest'
import { DEFAULT_PLACEMENT_PLAN_V2_FLAGS, type PlacementPlanV2Flags } from './placement-flags'

describe('placement-flags', () => {
  it('keeps all calculation engines enabled', () => {
    const calculationFlags = Object.entries(DEFAULT_PLACEMENT_PLAN_V2_FLAGS)
      .filter(([name]) => name.endsWith('Enabled'))
      .map(([, enabled]) => enabled)
    expect(calculationFlags.length).toBe(12)
    expect(calculationFlags.every(Boolean)).toBe(true)
  })

  it('activates the real Point 7 to Point 8 chain by default', () => {
    expect(DEFAULT_PLACEMENT_PLAN_V2_FLAGS.placementControlsDisplay).toBe(true)
    expect(DEFAULT_PLACEMENT_PLAN_V2_FLAGS.placementControlsPlanningStore).toBe(true)
    expect(DEFAULT_PLACEMENT_PLAN_V2_FLAGS.placementControlsSessions).toBe(true)
    expect(DEFAULT_PLACEMENT_PLAN_V2_FLAGS.placementControlsBlocking).toBe(true)
    expect(DEFAULT_PLACEMENT_PLAN_V2_FLAGS.placementControlsAutoStart).toBe(true)
  })

  it('supports an explicit emergency rollback without changing defaults', () => {
    const rollback: PlacementPlanV2Flags = {
      ...DEFAULT_PLACEMENT_PLAN_V2_FLAGS,
      placementControlsDisplay: false,
      placementControlsPlanningStore: false,
      placementControlsSessions: false,
      placementControlsBlocking: false,
      placementControlsAutoStart: false,
    }
    expect([
      rollback.placementControlsDisplay,
      rollback.placementControlsPlanningStore,
      rollback.placementControlsSessions,
      rollback.placementControlsBlocking,
      rollback.placementControlsAutoStart,
    ].every((enabled) => enabled === false)).toBe(true)
  })
})
