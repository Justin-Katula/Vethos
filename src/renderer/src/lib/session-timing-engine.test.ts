import { describe, expect, it } from 'vitest'
import { buildSessionTiming } from './session-timing-engine'
import type { SessionInputData } from './session-input-adapter'

describe('session-timing-engine', () => {
  const baseInputData: SessionInputData = {
    targetType: 'task',
    targetId: 't1',
    placementBlock: {
      id: 'b1',
      targetType: 'task',
      targetId: 't1',
      kind: 'work',
      title: 'T',
      date: '2026-06-26',
      start: '10:00',
      end: '11:00',
      durationMinutes: 60,
      sourceWindowId: 'win1',
      placementMode: 'normal',
      confidence: 100,
      locked: false,
      reasons: [],
      warnings: [],
    },
    warnings: [],
    confidence: 100
  }

  it('calculates timing for normal session', () => {
    const res = buildSessionTiming(baseInputData)
    expect(res.plannedDurationMinutes).toBe(60)
    expect(res.minimumUsefulMinutes).toBe(20)
    expect(res.allowPause).toBe(true)
    expect(res.maxPauseMinutes).toBe(5)
  })

  it('restricts pauses for short sessions', () => {
    const res = buildSessionTiming({
      ...baseInputData,
      placementBlock: { ...baseInputData.placementBlock, durationMinutes: 30 }
    })
    expect(res.allowPause).toBe(false)
    expect(res.maxPauseMinutes).toBeUndefined()
  })

  it('forces deep work rules', () => {
    const res = buildSessionTiming({
      ...baseInputData,
      placementBlock: { ...baseInputData.placementBlock, placementMode: 'deep_work' }
    })
    expect(res.minimumUsefulMinutes).toBe(30)
    expect(res.lateStartGraceMinutes).toBe(5)
  })

  it('forces strict limits for rescue plans', () => {
    const res = buildSessionTiming({
      ...baseInputData,
      placementBlock: { ...baseInputData.placementBlock, placementMode: 'rescue' }
    })
    expect(res.allowPause).toBe(true)
    expect(res.maxPauseMinutes).toBe(3)
    expect(res.overtimePolicy).toBe('deny_overtime')
  })

  it('handles negative or zero duration safely', () => {
    const res = buildSessionTiming({
      ...baseInputData,
      placementBlock: { ...baseInputData.placementBlock, durationMinutes: 0 }
    })
    expect(res.minimumUsefulMinutes).toBe(0)
    expect(res.warnings[0]).toContain('invalide')
  })
})
