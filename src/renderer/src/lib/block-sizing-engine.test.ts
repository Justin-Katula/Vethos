import { describe, expect, it } from 'vitest'
import { calculateProposedBlockSize } from './block-sizing-engine'
import type { PlacementCandidate, PlacementWindowFit } from '@shared/placement-model'
import type { AnyFreeTimeWindow } from './placement-window-selector'

describe('block-sizing-engine', () => {
  const candidate: PlacementCandidate = {
    id: 'c1',
    targetType: 'task',
    targetId: 't1',
    title: 'Test',
    remainingMinutes: 120,
    minimumUsefulMinutes: 30,
    recommendedMinutes: 60,
    maximumSafeMinutes: 150,
    requiresDeepWork: false,
    canSplit: true,
    canUseShortGap: true,
    shouldAvoidLateNight: false,
    priorityScore: 50,
    reasons: [],
    warnings: [],
    confidence: 100,
  }

  const window: AnyFreeTimeWindow = {
    id: 'w1',
    start: '10:00',
    end: '14:00',
    usableDurationMinutes: 240,
    canHostTask: true,
    canHostDeepWork: true,
    windowType: 'normal',
  }

  const fit: PlacementWindowFit = {
    candidateId: 'c1',
    windowId: 'w1',
    canFit: true,
    fitScore: 80,
    proposedDurationMinutes: 60,
    reasons: [],
    warnings: [],
  }

  it('calculates normal mode using recommended minutes', () => {
    const size = calculateProposedBlockSize({ candidate, window, fit, placementMode: 'normal' })
    expect(size.durationMinutes).toBe(60) // Recommended is 60
  })

  it('calculates intensive mode maximizing safe duration', () => {
    const size = calculateProposedBlockSize({ candidate, window, fit, placementMode: 'intensive' })
    // remaining is 120, max safe is 150, window is 240
    // so it should take 120 (bound by remaining)
    expect(size.durationMinutes).toBe(120)
  })

  it('calculates minimum_viable mode using minimal useful time', () => {
    const size = calculateProposedBlockSize({ candidate, window, fit, placementMode: 'minimum_viable' })
    // Minimum viable limits to max 45, or minimum useful
    expect(size.durationMinutes).toBeGreaterThanOrEqual(30)
    expect(size.durationMinutes).toBeLessThanOrEqual(45)
  })

  it('calculates rescue mode with focused blocks', () => {
    const rescueCandidate = { ...candidate, recommendedMinutes: 90 }
    const size = calculateProposedBlockSize({ candidate: rescueCandidate, window, fit, placementMode: 'rescue' })
    expect(size.durationMinutes).toBe(60) // Capped at 60 for rescue blocks
  })

  it('calculates manual_review mode for short block', () => {
    const size = calculateProposedBlockSize({ candidate, window, fit, placementMode: 'manual_review' })
    expect(size.durationMinutes).toBe(30) // Capped at 30
  })

  it('respects remainingMinutes strictly', () => {
    const almostDone = { ...candidate, remainingMinutes: 15, minimumUsefulMinutes: 10 }
    const size = calculateProposedBlockSize({ candidate: almostDone, window, fit, placementMode: 'intensive' })
    expect(size.durationMinutes).toBe(15) // Can't be more than remaining
  })

  it('does not consume whole window unnecessarily in normal mode if huge', () => {
    const largeCandidate = { ...candidate, recommendedMinutes: 120, remainingMinutes: 120 }
    const largeWindow = { ...window, usableDurationMinutes: 120 }
    const size = calculateProposedBlockSize({ candidate: largeCandidate, window: largeWindow, fit, placementMode: 'normal' })

    // Normal mode should leave a buffer if duration > 90 and window is very tight
    expect(size.durationMinutes).toBeLessThan(120)
    expect(size.durationMinutes).toBeGreaterThanOrEqual(90)
  })

  it('respecte maximumSafeMinutes même en mode intensive', () => {
    const cappedCandidate = { ...candidate, maximumSafeMinutes: 100, remainingMinutes: 300 }
    const size = calculateProposedBlockSize({
      candidate: cappedCandidate,
      window,
      fit,
      placementMode: 'intensive',
    })
    expect(size.durationMinutes).toBeLessThanOrEqual(100)
  })

  it('respecte usableDurationMinutes de la fenêtre', () => {
    const smallWindow = { ...window, usableDurationMinutes: 50 }
    const size = calculateProposedBlockSize({
      candidate,
      window: smallWindow,
      fit,
      placementMode: 'normal',
    })
    expect(size.durationMinutes).toBeLessThanOrEqual(50)
  })

  it('produit des warnings explicites en mode minimum_viable quand la durée est réduite', () => {
    const bigCandidate = { ...candidate, recommendedMinutes: 120, minimumUsefulMinutes: 30 }
    const size = calculateProposedBlockSize({
      candidate: bigCandidate,
      window,
      fit,
      placementMode: 'minimum_viable',
    })
    expect(size.durationMinutes).toBeLessThan(120)
    // En mode survie, un warning doit expliquer la réduction.
    expect(size.warnings.length).toBeGreaterThan(0)
    expect(size.reason).toContain('minimum viable')
  })
})
