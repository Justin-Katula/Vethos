import { describe, expect, it } from 'vitest'
import { calculateWindowFit } from './task-fit-engine'
import type { PlacementCandidate } from '@shared/placement-model'

describe('task-fit-engine', () => {
  const baseCandidate: PlacementCandidate = {
    id: 'c1',
    targetType: 'task',
    targetId: 't1',
    title: 'Test',
    remainingMinutes: 60,
    minimumUsefulMinutes: 30,
    recommendedMinutes: 60,
    maximumSafeMinutes: 120,
    requiresDeepWork: false,
    canSplit: true,
    canUseShortGap: true,
    shouldAvoidLateNight: false,
    priorityScore: 50,
    reasons: [],
    warnings: [],
    confidence: 100,
  }

  const baseWindow = {
    id: 'w1',
    start: '10:00',
    end: '11:00',
    usableDurationMinutes: 60,
    canHostTask: true,
    canHostDeepWork: true,
    windowType: 'normal' as const,
  }

  it('fits perfectly in a matching window', () => {
    const fit = calculateWindowFit({ candidate: baseCandidate, window: baseWindow })
    expect(fit.canFit).toBe(true)
    expect(fit.proposedDurationMinutes).toBe(60)
    expect(fit.fitScore).toBeGreaterThan(50) // Since there are positive factors
  })

  it('fails if window is too short', () => {
    const fit = calculateWindowFit({
      candidate: baseCandidate,
      window: { ...baseWindow, usableDurationMinutes: 15 },
    })
    expect(fit.canFit).toBe(false)
    expect(fit.proposedDurationMinutes).toBe(0)
  })

  it('fails if requires deep work but window is not deep', () => {
    const deepCandidate = { ...baseCandidate, requiresDeepWork: true }
    const nonDeepWindow = { ...baseWindow, canHostDeepWork: false }
    const fit = calculateWindowFit({ candidate: deepCandidate, window: nonDeepWindow })
    
    expect(fit.canFit).toBe(false)
    expect(fit.reasons).toContain('Deep work requis mais fenêtre non compatible.')
  })

  it('fails if deadline is passed', () => {
    const candidateWithDeadline = { ...baseCandidate, deadline: '09:00' }
    const fit = calculateWindowFit({ candidate: candidateWithDeadline, window: baseWindow })
    
    expect(fit.canFit).toBe(false)
  })

  it('limits proposedDuration to maximumSafeMinutes', () => {
    const hugeWindow = { ...baseWindow, usableDurationMinutes: 240 }
    const limitedCandidate = { ...baseCandidate, maximumSafeMinutes: 90, recommendedMinutes: 150 }
    
    const fit = calculateWindowFit({ candidate: limitedCandidate, window: hugeWindow })
    expect(fit.canFit).toBe(true)
    expect(fit.proposedDurationMinutes).toBe(90) // Clamped to max safe
    expect(fit.proposedDurationMinutes).toBeLessThanOrEqual(hugeWindow.usableDurationMinutes)
  })

  it('limits proposedDuration to usable window time', () => {
    const candidate = { ...baseCandidate, recommendedMinutes: 90 }
    const window = { ...baseWindow, usableDurationMinutes: 45 }
    
    const fit = calculateWindowFit({ candidate, window })
    expect(fit.canFit).toBe(true)
    expect(fit.proposedDurationMinutes).toBe(45) // Bounded by window
  })

  it('does not exceed remainingMinutes if almost done', () => {
    const almostDoneCandidate = { ...baseCandidate, remainingMinutes: 20, reasons: ['Tâche presque terminée'] }
    const window = { ...baseWindow, usableDurationMinutes: 60 }

    const fit = calculateWindowFit({ candidate: almostDoneCandidate, window })
    expect(fit.canFit).toBe(false) // minimumUseful is 30, remaining is 20 -> fails canFit because proposed (20) < min (30).

    const validAlmostDone = { ...almostDoneCandidate, minimumUsefulMinutes: 10 }
    const validFit = calculateWindowFit({ candidate: validAlmostDone, window })
    expect(validFit.canFit).toBe(true)
    expect(validFit.proposedDurationMinutes).toBe(20) // Only takes what's needed
  })

  it('limite une tâche énorme par usableDuration et maximumSafe (le bornage par remaining se fait au sizing)', () => {
    const hugeTask = {
      ...baseCandidate,
      remainingMinutes: 40,
      recommendedMinutes: 200,
      maximumSafeMinutes: 90,
    }
    const hugeWindow = { ...baseWindow, usableDurationMinutes: 240 }

    const fit = calculateWindowFit({ candidate: hugeTask, window: hugeWindow })
    expect(fit.canFit).toBe(true)
    // Le fit-engine borne par recommended/usable/maxSafe. Le bornage final par remaining
    // est la responsabilité du block-sizing-engine. On vérifie donc le respect maxSafe ici.
    expect(fit.proposedDurationMinutes).toBeLessThanOrEqual(90)
    expect(fit.proposedDurationMinutes).toBeLessThanOrEqual(hugeWindow.usableDurationMinutes)
  })

  it('borne fitScore entre 0 et 100 même avec facteurs extrêmes', () => {
    // Score maximal : high priority + deep work + bonne durée + deadline.
    const highPriorityCandidate = {
      ...baseCandidate,
      requiresDeepWork: true,
      priorityScore: 100,
      deadline: '23:59',
      recommendedMinutes: 60,
    }
    const perfectWindow = { ...baseWindow, usableDurationMinutes: 120, canHostDeepWork: true }

    const fitHigh = calculateWindowFit({ candidate: highPriorityCandidate, window: perfectWindow })
    expect(fitHigh.fitScore).toBeLessThanOrEqual(100)
    expect(fitHigh.fitScore).toBeGreaterThanOrEqual(0)

    // Score minimal : canFit=false force fitScore à 0.
    const fitLow = calculateWindowFit({
      candidate: baseCandidate,
      window: { ...baseWindow, usableDurationMinutes: 5 },
    })
    expect(fitLow.fitScore).toBe(0)
    expect(fitLow.fitScore).toBeGreaterThanOrEqual(0)
  })
})
