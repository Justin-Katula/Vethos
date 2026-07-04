import { describe, expect, it } from 'vitest'
import type { PriorityScoreDimensions, PriorityScoreV2 } from '@shared/priority-score-model'
import { runPriorityScoreDiagnostics } from './priority-diagnostics'

const dimensions: PriorityScoreDimensions = {
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

function score(id: string, over: Partial<PriorityScoreV2> = {}, dimensionOver: Partial<PriorityScoreDimensions> = {}): PriorityScoreV2 {
  return {
    targetType: 'task',
    targetId: id,
    totalScore: 50,
    actionPriorityScore: 50,
    planningPriorityScore: 50,
    protectionPriorityScore: 40,
    recoveryPriorityScore: 30,
    dimensions: { ...dimensions, ...dimensionOver },
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

describe('priority-diagnostics', () => {
  it('détecte un completed avec score haut', () => {
    const diagnostics = runPriorityScoreDiagnostics({
      taskScores: [
        score('done', {
          totalScore: 75,
          recommendation: {
            recommendedAction: 'ignore_for_now',
            reason: 'done',
            urgencyLabel: 'none',
            riskLabel: 'safe',
            confidence: 90,
          },
        }),
      ],
      objectiveScores: [],
      comparisons: [],
    })

    expect(diagnostics.status).toBe('critical')
    expect(diagnostics.issues.some((issue) => issue.id === 'completed_score_high')).toBe(true)
  })

  it('détecte deadline critique avec urgency basse', () => {
    const diagnostics = runPriorityScoreDiagnostics({
      taskScores: [score('deadline', {}, { deadlinePressureScore: 95, urgencyScore: 20 })],
      objectiveScores: [],
      comparisons: [],
    })

    expect(diagnostics.issues.some((issue) => issue.id === 'critical_deadline_low_urgency')).toBe(true)
  })

  it('détecte score élevé avec confiance basse', () => {
    const diagnostics = runPriorityScoreDiagnostics({
      taskScores: [score('low-confidence', { totalScore: 90, confidence: 25 })],
      objectiveScores: [],
      comparisons: [],
    })

    expect(diagnostics.issues.some((issue) => issue.id === 'high_score_low_confidence')).toBe(true)
  })

  it('détecte contradiction old/new', () => {
    const diagnostics = runPriorityScoreDiagnostics({
      taskScores: [],
      objectiveScores: [],
      comparisons: [
        {
          targetType: 'task',
          targetId: 'task-1',
          oldScore: 90,
          newTotalScore: 10,
          differenceLabel: 'conflict',
          explanation: ['contradiction'],
          shouldInspect: true,
        },
      ],
    })

    expect(diagnostics.status).toBe('warning')
    expect(diagnostics.issues.some((issue) => issue.id === 'old_new_conflict')).toBe(true)
  })

  it('détecte un objectif central actif sans tâche active liée', () => {
    const diagnostics = runPriorityScoreDiagnostics({
      taskScores: [],
      objectiveScores: [
        score('obj-1', {
          targetType: 'objective',
          dimensions: {
            ...dimensions,
            importanceScore: 80,
          },
          recommendation: {
            recommendedAction: 'create_task',
            urgencyLabel: 'low',
            riskLabel: 'safe',
            confidence: 80,
            reason: 'L’objectif a besoin d’une tâche.',
          },
          metadata: {
            modelVersion: 2,
            createdAt: '2026-06-25T12:00:00.000Z',
            updatedAt: '2026-06-25T12:00:00.000Z',
            source: 'priority_score_engine',
            advisoryOnly: true,
            debug: {
              linkedTaskScoreCount: 0,
            },
          },
        }),
      ],
      comparisons: [],
    })

    expect(diagnostics.issues.some((issue) => issue.id === 'central_objective_no_active_tasks')).toBe(true)
  })
})
