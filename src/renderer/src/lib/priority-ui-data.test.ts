import { describe, expect, it } from 'vitest'
import type { PriorityScoreV2 } from '@shared/priority-score-model'
import { buildPriorityUiData } from './priority-ui-data'

describe('priority-ui-data', () => {
  it('transforme les chiffres en données affichables sans tableau Excel', () => {
    const score: PriorityScoreV2 = {
      targetType: 'task',
      targetId: 'task-1',
      totalScore: 82,
      actionPriorityScore: 82,
      planningPriorityScore: 70,
      protectionPriorityScore: 76,
      recoveryPriorityScore: 30,
      dimensions: {
        importanceScore: 80,
        objectiveImpactScore: 70,
        urgencyScore: 85,
        deadlinePressureScore: 80,
        feasibilityScore: 55,
        workloadPressureScore: 70,
        progressNeedScore: 60,
        stagnationScore: 30,
        avoidanceScore: 20,
        momentumScore: 50,
        cognitiveFitScore: 60,
        protectionNeedScore: 76,
        completionReliabilityScore: 50,
        ambiguityPenalty: 10,
        overloadPenalty: 20,
        uncertaintyPenalty: 15,
      },
      recommendation: {
        recommendedAction: 'do_now',
        suggestedDurationMinutes: 75,
        reason: 'Deadline proche.',
        urgencyLabel: 'critical',
        riskLabel: 'at_risk',
        confidence: 80,
      },
      explanation: {
        title: 'Priorité haute',
        summary: 'Résumé',
        reasons: ['Deadline proche.', 'Objectif important.'],
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
    }

    const ui = buildPriorityUiData(score)

    expect(ui.priorityLabel).toBe('high')
    expect(ui.mainReason).toBe('Deadline proche.')
    expect(ui.nextAction).toBe('do_now')
    expect(ui.why).toHaveLength(2)
  })
})
