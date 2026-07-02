import { describe, expect, it } from 'vitest'
import type { PriorityScoreV2 } from '@shared/priority-score-model'
import { explainPriorityScore } from './priority-explanation-engine'

function score(over: Partial<PriorityScoreV2> = {}): PriorityScoreV2 {
  return {
    targetType: 'task',
    targetId: 'task-1',
    totalScore: 82,
    actionPriorityScore: 82,
    planningPriorityScore: 75,
    protectionPriorityScore: 60,
    recoveryPriorityScore: 40,
    dimensions: {
      importanceScore: 85,
      objectiveImpactScore: 80,
      urgencyScore: 90,
      deadlinePressureScore: 88,
      feasibilityScore: 55,
      workloadPressureScore: 70,
      progressNeedScore: 60,
      stagnationScore: 30,
      avoidanceScore: 20,
      momentumScore: 50,
      cognitiveFitScore: 65,
      protectionNeedScore: 60,
      completionReliabilityScore: 50,
      ambiguityPenalty: 10,
      overloadPenalty: 20,
      uncertaintyPenalty: 15,
    },
    recommendation: {
      recommendedAction: 'do_now',
      reason: 'Deadline proche et faisabilité suffisante.',
      urgencyLabel: 'critical',
      riskLabel: 'at_risk',
      confidence: 80,
    },
    explanation: {
      title: '',
      summary: '',
      reasons: [],
      warnings: [],
    },
    confidence: 80,
    metadata: {
      modelVersion: 2,
      createdAt: '2026-06-25T12:00:00.000Z',
      updatedAt: '2026-06-25T12:00:00.000Z',
      source: 'shadow_priority_engine',
      shadowOnly: true,
    },
    ...over,
  }
}

describe('priority-explanation-engine', () => {
  it('produit une explication claire et limitée', () => {
    const explanation = explainPriorityScore(score())

    expect(explanation.title).toContain('priorité')
    expect(explanation.reasons.length).toBeLessThanOrEqual(5)
    expect(explanation.reasons[0]).toContain('Deadline')
  })

  it('ajoute warning quand la confiance est faible', () => {
    const explanation = explainPriorityScore(
      score({
        confidence: 30,
        dimensions: {
          ...score().dimensions,
          uncertaintyPenalty: 75,
        },
      }),
    )

    expect(explanation.warnings.some((warning) => warning.includes('confiance'))).toBe(true)
  })
})
