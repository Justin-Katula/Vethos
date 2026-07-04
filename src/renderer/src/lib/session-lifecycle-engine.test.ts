import { describe, expect, it } from 'vitest'
import { buildSessionLifecycleProjection } from './session-lifecycle-engine'
import type { SessionContract, SessionPreflightResult, SessionProtectionPlan } from '@shared/session-model'
import type { SessionTimingResult } from './session-timing-engine'

const timing: SessionTimingResult = {
  plannedStart: '10:00', plannedEnd: '11:00', plannedDurationMinutes: 60,
  minimumUsefulMinutes: 20, maximumSafeMinutes: 90, lateStartGraceMinutes: 10,
  earlyStopPenaltyMinutes: 5, allowPause: true, maxPauseMinutes: 5,
  overtimePolicy: 'ask_before_overtime', reasons: [], warnings: [], confidence: 90,
}
const contract = {} as SessionContract
const protection = {} as SessionProtectionPlan
const ready: SessionPreflightResult = {
  readiness: 'ready', canStart: true, blockers: [], warnings: [], requiredActions: [], confidence: 90,
}

describe('session-lifecycle-engine', () => {
  it('uses the seven real lifecycle states without temporary suffixes', () => {
    const result = buildSessionLifecycleProjection({ preflight: ready, timing, contract, protection })
    expect(result.initialState).toBe('ready')
    expect(result.allowedTransitions).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: 'planned', to: 'ready' }),
      expect.objectContaining({ from: 'ready', to: 'active' }),
      expect.objectContaining({ from: 'active', to: 'completed' }),
      expect.objectContaining({ from: 'active', to: 'aborted' }),
      expect.objectContaining({ from: 'planned', to: 'missed' }),
      expect.objectContaining({ from: 'active', to: 'invalid' }),
    ]))
    expect(JSON.stringify(result)).not.toContain('shadow')
    expect(JSON.stringify(result)).not.toContain('proposed')
  })

  it('keeps a future ready session planned', () => {
    const result = buildSessionLifecycleProjection({
      preflight: { ...ready, readiness: 'ready_with_warnings', requiredActions: ['wait_for_planned_time'] },
      timing, contract, protection,
    })
    expect(result.initialState).toBe('planned')
  })

  it('marks critical malformed input invalid', () => {
    const result = buildSessionLifecycleProjection({
      preflight: { ...ready, canStart: false, readiness: 'blocked_by_missing_data', blockers: ['Cible introuvable.'] },
      timing, contract, protection,
    })
    expect(result.initialState).toBe('invalid')
  })
})
