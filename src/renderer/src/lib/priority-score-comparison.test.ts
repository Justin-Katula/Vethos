import { describe, expect, it } from 'vitest'
import type { PriorityScoreV2 } from '@shared/priority-score-model'
import { compareOldAndNewPriorityScore } from './priority-score-comparison'

function score(totalScore: number): PriorityScoreV2 {
  return {
    targetType: 'task',
    targetId: 'task-1',
    totalScore,
    actionPriorityScore: totalScore,
    planningPriorityScore: totalScore,
    protectionPriorityScore: 30,
    recoveryPriorityScore: 20,
    dimensions: {
      importanceScore: totalScore,
      objectiveImpactScore: totalScore,
      urgencyScore: totalScore,
      deadlinePressureScore: totalScore,
      feasibilityScore: 60,
      workloadPressureScore: totalScore,
      progressNeedScore: totalScore,
      stagnationScore: 20,
      avoidanceScore: 20,
      momentumScore: 20,
      cognitiveFitScore: 60,
      protectionNeedScore: 30,
      completionReliabilityScore: 50,
      ambiguityPenalty: 10,
      overloadPenalty: 10,
      uncertaintyPenalty: 10,
    },
    recommendation: {
      recommendedAction: 'schedule_soon',
      reason: 'test',
      urgencyLabel: 'medium',
      riskLabel: 'watch',
      confidence: 70,
    },
    explanation: {
      title: 'test',
      summary: 'test',
      reasons: [],
      warnings: [],
    },
    confidence: 70,
    metadata: {
      modelVersion: 2,
      createdAt: '2026-06-25T12:00:00.000Z',
      updatedAt: '2026-06-25T12:00:00.000Z',
      source: 'shadow_priority_engine',
      shadowOnly: true,
    },
  }
}

describe('priority-score-comparison', () => {
  it('détecte old missing', () => {
    const result = compareOldAndNewPriorityScore(undefined, score(60))

    expect(result.differenceLabel).toBe('old_missing')
    expect(result.shouldInspect).toBe(false)
  })

  it('détecte un conflit fort', () => {
    const result = compareOldAndNewPriorityScore(90, score(10))

    expect(result.differenceLabel).toBe('conflict')
    expect(result.shouldInspect).toBe(true)
  })
})
