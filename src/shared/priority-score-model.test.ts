import { describe, expect, it } from 'vitest'
import { DEFAULT_PRIORITY_SCORE_V2_FLAGS } from './priority-flags'
import type { PriorityScoreDimensions } from './priority-score-model'

describe('priority-score-model contracts', () => {
  it('garde les flags dangereux désactivés par défaut', () => {
    expect(DEFAULT_PRIORITY_SCORE_V2_FLAGS.priorityScoreV2ShadowEnabled).toBe(true)
    expect(DEFAULT_PRIORITY_SCORE_V2_FLAGS.priorityDimensionsShadowEnabled).toBe(true)
    expect(DEFAULT_PRIORITY_SCORE_V2_FLAGS.priorityControlsDisplay).toBe(false)
    expect(DEFAULT_PRIORITY_SCORE_V2_FLAGS.priorityControlsSorting).toBe(false)
    expect(DEFAULT_PRIORITY_SCORE_V2_FLAGS.priorityControlsPlanning).toBe(false)
    expect(DEFAULT_PRIORITY_SCORE_V2_FLAGS.priorityControlsSessionChoice).toBe(false)
    expect(DEFAULT_PRIORITY_SCORE_V2_FLAGS.priorityControlsBlocking).toBe(false)
  })

  it('représente toutes les dimensions multi-scores attendues', () => {
    const dimensions: PriorityScoreDimensions = {
      importanceScore: 80,
      objectiveImpactScore: 70,
      urgencyScore: 60,
      deadlinePressureScore: 55,
      feasibilityScore: 65,
      workloadPressureScore: 50,
      progressNeedScore: 40,
      stagnationScore: 30,
      avoidanceScore: 20,
      momentumScore: 45,
      cognitiveFitScore: 75,
      protectionNeedScore: 85,
      completionReliabilityScore: 90,
      ambiguityPenalty: 10,
      overloadPenalty: 15,
      uncertaintyPenalty: 20,
    }

    expect(Object.keys(dimensions)).toHaveLength(16)
    expect(Object.values(dimensions).every((score) => score >= 0 && score <= 100)).toBe(true)
  })
})
