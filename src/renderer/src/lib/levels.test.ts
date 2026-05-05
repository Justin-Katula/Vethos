import { describe, it, expect } from 'vitest'
import { getLevelInfo, LEVEL_THRESHOLDS_MIN } from './levels'

describe('LEVEL_THRESHOLDS_MIN', () => {
  it('contient 11 seuils strictement croissants', () => {
    expect(LEVEL_THRESHOLDS_MIN).toHaveLength(11)
    for (let i = 1; i < LEVEL_THRESHOLDS_MIN.length; i++) {
      expect(LEVEL_THRESHOLDS_MIN[i]!).toBeGreaterThan(LEVEL_THRESHOLDS_MIN[i - 1]!)
    }
    expect(LEVEL_THRESHOLDS_MIN[0]).toBe(0)
    expect(LEVEL_THRESHOLDS_MIN[10]).toBe(50000)
  })
})

describe('getLevelInfo', () => {
  it('xp=0 → niveau 1, progress 0', () => {
    const info = getLevelInfo(0)
    expect(info.level).toBe(1)
    expect(info.progress).toBe(0)
    expect(info.isMax).toBe(false)
    expect(info.currentLevelStart).toBe(0)
    expect(info.nextLevelStart).toBe(600)
  })

  it('xp=599 → niveau 1, progress proche de 1', () => {
    const info = getLevelInfo(599)
    expect(info.level).toBe(1)
    expect(info.progress).toBeCloseTo(599 / 600, 5)
    expect(info.isMax).toBe(false)
  })

  it('xp=600 → niveau 2, progress 0', () => {
    const info = getLevelInfo(600)
    expect(info.level).toBe(2)
    expect(info.progress).toBe(0)
    expect(info.currentLevelStart).toBe(600)
    expect(info.nextLevelStart).toBe(1500)
  })

  it('xp=9000 → niveau 6, progress = (9000-8000)/(12000-8000) = 0.25', () => {
    const info = getLevelInfo(9000)
    expect(info.level).toBe(6)
    expect(info.progress).toBeCloseTo(0.25, 5)
    expect(info.currentLevelStart).toBe(8000)
    expect(info.nextLevelStart).toBe(12000)
  })

  it('xp=50000 → niveau 10, isMax true, progress 1', () => {
    const info = getLevelInfo(50000)
    expect(info.level).toBe(10)
    expect(info.isMax).toBe(true)
    expect(info.progress).toBe(1)
  })

  it('xp=100000 → clamping niveau 10, progress 1', () => {
    const info = getLevelInfo(100000)
    expect(info.level).toBe(10)
    expect(info.isMax).toBe(true)
    expect(info.progress).toBe(1)
  })

  it('xp négatif → niveau 1, progress 0 (clamping bas)', () => {
    const info = getLevelInfo(-100)
    expect(info.level).toBe(1)
    expect(info.progress).toBe(0)
  })

  it('xp=1499 → niveau 2, juste avant niveau 3', () => {
    const info = getLevelInfo(1499)
    expect(info.level).toBe(2)
    expect(info.progress).toBeCloseTo((1499 - 600) / (1500 - 600), 5)
  })

  it('xp=36000 → niveau 10 atteint, isMax true, progress 1', () => {
    const info = getLevelInfo(36000)
    expect(info.level).toBe(10)
    expect(info.isMax).toBe(true)
    expect(info.progress).toBe(1)
  })
})
