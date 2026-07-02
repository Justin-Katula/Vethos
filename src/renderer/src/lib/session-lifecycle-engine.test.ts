import { describe, expect, it } from 'vitest'
import { buildSessionLifecycleProjection } from './session-lifecycle-engine'
import type { SessionContract, SessionPreflightResult, SessionProtectionPlan } from '@shared/session-model'
import type { SessionTimingResult } from './session-timing-engine'

describe('session-lifecycle-engine', () => {
  const basePreflight: SessionPreflightResult = {
    canStart: true,
    readiness: 'ready',
    blockers: [],
    warnings: [],
    requiredActions: [],
    confidence: 100
  }

  const baseTiming: SessionTimingResult = {
    plannedStart: '10:00',
    plannedEnd: '11:00',
    plannedDurationMinutes: 60,
    minimumUsefulMinutes: 30,
    maximumSafeMinutes: 120,
    lateStartGraceMinutes: 10,
    earlyStopPenaltyMinutes: 5,
    allowPause: true,
    maxPauseMinutes: 5,
    overtimePolicy: 'allow_short_overtime',
    reasons: [],
    warnings: [],
    confidence: 100
  }

  const baseContract = {} as SessionContract
  const baseProtection = {} as SessionProtectionPlan

  it('sets initial state to ready_shadow when preflight is ready', () => {
    const res = buildSessionLifecycleProjection({
      preflight: basePreflight,
      timing: baseTiming,
      contract: baseContract,
      protection: baseProtection
    })
    expect(res.initialState).toBe('ready_shadow')
    expect(res.allowedTransitions.map(t => `${t.from}->${t.to}`)).toContain('ready_shadow->active_shadow')
  })

  it('sets initial state to planned_shadow when waiting for future time', () => {
    const res = buildSessionLifecycleProjection({
      preflight: { ...basePreflight, requiredActions: ['wait_for_planned_time'] },
      timing: baseTiming,
      contract: baseContract,
      protection: baseProtection
    })
    expect(res.initialState).toBe('planned_shadow')
    expect(res.allowedTransitions.map(t => `${t.from}->${t.to}`)).toContain('planned_shadow->ready_shadow')
  })

  it('sets initial state to invalid_shadow when blocked critically', () => {
    const res = buildSessionLifecycleProjection({
      preflight: { ...basePreflight, canStart: false, readiness: 'blocked_by_missing_data' },
      timing: baseTiming,
      contract: baseContract,
      protection: baseProtection
    })
    expect(res.initialState).toBe('invalid_shadow')
  })
})
