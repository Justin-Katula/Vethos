import { describe, expect, it } from 'vitest'
import type { PriorityScoreDimensions, PriorityScoreV2 } from '@shared/priority-score-model'
import { rankPriorityItemsV2 } from './priority-ranking-engine-v2'

const baseDimensions: PriorityScoreDimensions = {
  importanceScore: 50,
  objectiveImpactScore: 50,
  urgencyScore: 50,
  deadlinePressureScore: 50,
  feasibilityScore: 60,
  workloadPressureScore: 50,
  progressNeedScore: 50,
  stagnationScore: 20,
  avoidanceScore: 20,
  momentumScore: 20,
  cognitiveFitScore: 60,
  protectionNeedScore: 40,
  completionReliabilityScore: 50,
  ambiguityPenalty: 10,
  overloadPenalty: 10,
  uncertaintyPenalty: 10,
}

function score(id: string, over: Partial<PriorityScoreV2> = {}, dimensions: Partial<PriorityScoreDimensions> = {}): PriorityScoreV2 {
  const merged = { ...baseDimensions, ...dimensions }
  return {
    targetType: 'task',
    targetId: id,
    totalScore: 50,
    actionPriorityScore: 50,
    planningPriorityScore: 50,
    protectionPriorityScore: 40,
    recoveryPriorityScore: 30,
    dimensions: merged,
    recommendation: {
      recommendedAction: 'schedule_soon',
      reason: 'Test',
      urgencyLabel: 'medium',
      riskLabel: 'watch',
      confidence: 70,
    },
    explanation: {
      title: 'Test',
      summary: 'Test',
      reasons: ['raison'],
      warnings: [],
    },
    confidence: 70,
    metadata: {
      modelVersion: 2,
      createdAt: '2026-06-25T12:00:00.000Z',
      updatedAt: '2026-06-25T12:00:00.000Z',
      source: 'priority_score_engine',
      advisoryOnly: true,
    },
    ...over,
  }
}

describe('priority-ranking-engine-v2', () => {
  it('classe en mode action avec actionPriorityScore', () => {
    const result = rankPriorityItemsV2(
      { tasks: [score('low', { actionPriorityScore: 30 }), score('high', { actionPriorityScore: 80 })] },
      { mode: 'action' },
    )

    expect(result.topItem?.score.targetId).toBe('high')
  })

  it('classe en mode planning avec faisabilité prise en compte', () => {
    const result = rankPriorityItemsV2(
      {
        tasks: [
          score('hard', { planningPriorityScore: 80 }, { feasibilityScore: 5 }),
          score('possible', { planningPriorityScore: 70 }, { feasibilityScore: 90 }),
        ],
      },
      { mode: 'planning' },
    )

    expect(result.topItem?.score.targetId).toBe('possible')
  })

  it('classe en mode protection avec protectionPriorityScore', () => {
    const result = rankPriorityItemsV2(
      { tasks: [score('normal', { protectionPriorityScore: 30 }), score('protected', { protectionPriorityScore: 90 })] },
      { mode: 'protection' },
    )

    expect(result.topItem?.score.targetId).toBe('protected')
  })

  it('départage une égalité avec deadline critique', () => {
    const result = rankPriorityItemsV2(
      {
        tasks: [
          score('normal', { actionPriorityScore: 70 }, { deadlinePressureScore: 30 }),
          score('deadline', { actionPriorityScore: 70 }, { deadlinePressureScore: 95 }),
        ],
      },
      { mode: 'action' },
    )

    expect(result.topItem?.score.targetId).toBe('deadline')
  })

  it('favorise parfois une tâche presque finie', () => {
    const result = rankPriorityItemsV2(
      {
        tasks: [
          score('large', { actionPriorityScore: 60 }, { progressNeedScore: 55 }),
          score(
            'almost',
            {
              actionPriorityScore: 60,
              recommendation: {
                recommendedAction: 'do_now',
                suggestedDurationMinutes: 20,
                reason: 'Presque fini',
                urgencyLabel: 'medium',
                riskLabel: 'safe',
                confidence: 80,
              },
            },
            { progressNeedScore: 80 },
          ),
        ],
      },
      { mode: 'action' },
    )

    expect(result.topItem?.score.targetId).toBe('almost')
  })
})
