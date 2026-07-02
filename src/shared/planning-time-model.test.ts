import { describe, expect, it } from 'vitest'
import { DEFAULT_PLANNING_CONTEXT_V2_FLAGS } from './planning-flags'
import { PLANNING_CONTEXT_V2_MODEL_VERSION, type FreeTimeWindow, type PlanningBlockKind } from './planning-time-model'

describe('planning-time-model contracts', () => {
  it('garde le modèle planning en shadow avec les contrôles dangereux désactivés', () => {
    expect(PLANNING_CONTEXT_V2_MODEL_VERSION).toBe(2)
    expect(DEFAULT_PLANNING_CONTEXT_V2_FLAGS.planningContextV2Enabled).toBe(true)
    expect(DEFAULT_PLANNING_CONTEXT_V2_FLAGS.scheduleNormalizerEnabled).toBe(true)
    expect(DEFAULT_PLANNING_CONTEXT_V2_FLAGS.planningContextControlsDisplay).toBe(false)
    expect(DEFAULT_PLANNING_CONTEXT_V2_FLAGS.planningContextControlsPlanning).toBe(false)
    expect(DEFAULT_PLANNING_CONTEXT_V2_FLAGS.planningContextControlsSessions).toBe(false)
    expect(DEFAULT_PLANNING_CONTEXT_V2_FLAGS.planningContextControlsBlocking).toBe(false)
  })

  it('représente les types de blocs et de fenêtres attendus', () => {
    const kind: PlanningBlockKind = 'preparation'
    const window: FreeTimeWindow = {
      id: 'window-1',
      date: '2026-06-22',
      start: '2026-06-22T08:00:00.000',
      end: '2026-06-22T08:45:00.000',
      rawDurationMinutes: 45,
      usableDurationMinutes: 0,
      windowType: 'preparation_only',
      canHostTask: false,
      canHostDeepWork: false,
      canHostRecovery: false,
      reasons: ["Préparation avant l'école."],
      confidence: 90,
    }

    expect(kind).toBe('preparation')
    expect(window.usableDurationMinutes).toBe(0)
    expect(window.canHostTask).toBe(false)
  })
})
