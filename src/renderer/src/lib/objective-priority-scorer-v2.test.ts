// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { Objective, Task } from '@shared/schemas'
import { buildEmptyUserModel } from '@shared/user-model'
import { buildObjectiveModelV2 } from './objective-model-builder'
import { scoreObjectivePriorityV2 } from './objective-priority-scorer-v2'

const NOW = new Date('2026-06-25T12:00:00.000Z')
const OBJECTIVE_ID = '22222222-2222-4222-8222-222222222222'

function objective(over: Partial<Objective> = {}): Objective {
  return {
    id: OBJECTIVE_ID,
    name: 'Finir Vethos',
    description: 'Objectif central',
    color: '#22c55e',
    linkedRuleIds: [],
    level: 7,
    status: 'active',
    createdAt: '2026-06-01T12:00:00.000Z',
    ...over,
  }
}

function task(over: Partial<Task> = {}): Task {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Créer le scorer objectif',
    linkedObjectiveId: OBJECTIVE_ID,
    deadline: '2026-06-26',
    deadlineImpact: 'hard',
    complexity: 'hard',
    estimatedMinutes: 240,
    remainingMinutes: 180,
    level: 8,
    status: 'active',
    createdAt: '2026-06-20T12:00:00.000Z',
    ...over,
  }
}

describe('objective-priority-scorer-v2', () => {
  it('score haut pour un objectif central vivant', () => {
    const obj = objective()
    const model = buildObjectiveModelV2({ objective: obj, linkedTasks: [task()], now: NOW })
    const result = scoreObjectivePriorityV2({ objectiveModelV2: model, now: NOW })

    expect(result.totalScore).toBeGreaterThan(40)
    expect(result.dimensions.importanceScore).toBeGreaterThanOrEqual(80)
  })

  it('monte recovery pour un objectif stagnant', () => {
    const model = buildObjectiveModelV2({
      objective: objective({ createdAt: '2026-05-01T12:00:00.000Z' }),
      linkedTasks: [task({ createdAt: '2026-05-01T12:00:00.000Z' })],
      sessions: [],
      now: NOW,
    })
    const result = scoreObjectivePriorityV2({ objectiveModelV2: model, now: NOW })

    expect(result.recoveryPriorityScore).toBeGreaterThan(35)
  })

  it('recommande create_task ou recover si l’objectif n’a pas de tâche', () => {
    const model = buildObjectiveModelV2({ objective: objective(), linkedTasks: [], now: NOW })
    const result = scoreObjectivePriorityV2({ objectiveModelV2: model, now: NOW })

    expect(['create_task', 'recover']).toContain(result.recommendation.recommendedAction)
  })

  it('met score 0 si objectif completed', () => {
    const model = buildObjectiveModelV2({
      objective: objective({ status: 'completed' }),
      linkedTasks: [],
      now: NOW,
    })
    const result = scoreObjectivePriorityV2({ objectiveModelV2: model, now: NOW })

    expect(result.totalScore).toBe(0)
    expect(result.recommendation.recommendedAction).toBe('ignore_for_now')
  })

  it('monte avoidance depuis le modèle utilisateur', () => {
    const userModel = buildEmptyUserModel('user-1', { now: NOW.toISOString() })
    userModel.objectivePreferences = [
      {
        objectiveId: OBJECTIVE_ID,
        declaredImportanceScore: 95,
        observedCommitmentScore: 20,
        lifeImpactScore: 90,
        avoidanceScore: 85,
        stagnationScore: 80,
        momentumScore: 5,
        confidence: 80,
        reasons: ['Objectif important mais évité.'],
        updatedAt: NOW.toISOString(),
      },
    ]
    const model = buildObjectiveModelV2({ objective: objective(), linkedTasks: [task()], userModel, now: NOW })
    const result = scoreObjectivePriorityV2({ objectiveModelV2: model, userModel, now: NOW })

    expect(result.dimensions.avoidanceScore).toBeGreaterThanOrEqual(80)
    expect(result.recoveryPriorityScore).toBeGreaterThan(45)
  })
})
