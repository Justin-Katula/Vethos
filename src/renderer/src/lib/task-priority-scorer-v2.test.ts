import { describe, expect, it } from 'vitest'
import type { Objective, Task } from '@shared/schemas'
import { buildObjectiveModelV2 } from './objective-model-builder'
import { buildTaskModelV2 } from './task-model-builder'
import { scoreTaskPriorityV2 } from './task-priority-scorer-v2'

const NOW = new Date('2026-06-25T12:00:00.000Z')
const OBJECTIVE_ID = '22222222-2222-4222-8222-222222222222'
const TASK_ID = '11111111-1111-4111-8111-111111111111'

function objective(over: Partial<Objective> = {}): Objective {
  return {
    id: OBJECTIVE_ID,
    name: 'Objectif central',
    description: 'Travail important',
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
    id: TASK_ID,
    title: 'Finir le moteur de priorité',
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

function score(over: Partial<Task> = {}) {
  const obj = objective()
  const t = task(over)
  const objectiveModel = buildObjectiveModelV2({ objective: obj, linkedTasks: [t], now: NOW })
  const taskModel = buildTaskModelV2({ task: t, objective: obj, objectiveModel, now: NOW })
  return scoreTaskPriorityV2({ taskModelV2: taskModel, linkedObjectiveModelV2: objectiveModel, now: NOW })
}

describe('task-priority-scorer-v2', () => {
  it('met score 0 si la complétion est vérifiée', () => {
    const obj = objective()
    const t = task()
    const objectiveModel = buildObjectiveModelV2({ objective: obj, linkedTasks: [t], now: NOW })
    const taskModel = buildTaskModelV2({
      task: t,
      objective: obj,
      objectiveModel,
      completionContract: {
        taskId: TASK_ID,
        outcomeKind: 'code',
        expectedOutcome: 'Moteur et tests terminés',
        acceptanceCriteria: ['moteur', 'tests'],
        requiredEvidenceScoreOverride: 55,
      },
      completionClaim: {
        userClaimedCompleted: true,
        progressClaim: 'completed',
        summary: 'J’ai créé le moteur et ajouté les tests.',
      },
      completionSessionEvidence: {
        durationMinutes: 90,
        usefulActivityMinutes: 86,
        endedNormally: true,
        strictMode: false,
      },
      now: NOW,
    })
    const result = scoreTaskPriorityV2({ taskModelV2: taskModel, linkedObjectiveModelV2: objectiveModel, now: NOW })

    expect(taskModel.completionVerification.verifiedCompleted).toBe(true)
    expect(result.totalScore).toBe(0)
    expect(result.recommendation.recommendedAction).toBe('ignore_for_now')
  })

  it('donne une actionPriority haute à une tâche deadline critical', () => {
    const obj = objective()
    const t = task({ remainingMinutes: 500 })
    const objectiveModel = buildObjectiveModelV2({ objective: obj, linkedTasks: [t], now: NOW })
    const taskModel = buildTaskModelV2({
      task: t,
      objective: obj,
      objectiveModel,
      usableFreeMinutesBeforeDeadline: 90,
      now: NOW,
    })
    const result = scoreTaskPriorityV2({
      taskModelV2: taskModel,
      linkedObjectiveModelV2: objectiveModel,
      planningContext: { usableFreeMinutesBeforeDeadline: 90 },
      now: NOW,
    })

    expect(result.actionPriorityScore).toBeGreaterThanOrEqual(55)
    expect(result.dimensions.deadlinePressureScore).toBeGreaterThanOrEqual(90)
  })

  it('recommande clarify_first pour une tâche vague', () => {
    const result = score({
      title: 'Faire',
      linkedObjectiveId: null,
      complexity: 'unknown',
      contextNotes: undefined,
      estimatedMinutes: undefined,
      remainingMinutes: undefined,
    })

    expect(result.recommendation.recommendedAction).toBe('clarify_first')
  })

  it('recommande split_first pour une tâche énorme', () => {
    const result = score({
      complexity: 'extreme',
      estimatedMinutes: 900,
      remainingMinutes: 760,
    })

    expect(result.recommendation.recommendedAction).toBe('split_first')
  })

  it('reconnaît une tâche liée à un objectif central', () => {
    const result = score()

    expect(result.dimensions.importanceScore).toBeGreaterThanOrEqual(70)
    expect(result.dimensions.objectiveImpactScore).toBeGreaterThanOrEqual(70)
  })

  it('garde prioritaire une tâche rejetée par CompletionGate', () => {
    const obj = objective()
    const t = task()
    const objectiveModel = buildObjectiveModelV2({ objective: obj, linkedTasks: [t], now: NOW })
    const taskModel = buildTaskModelV2({
      task: t,
      objective: obj,
      objectiveModel,
      completionClaim: {
        userClaimedCompleted: true,
        progressClaim: 'completed',
        summary: 'fini',
      },
      completionSessionEvidence: {
        durationMinutes: 6,
        usefulActivityMinutes: 0,
        unlockRequests: 2,
        distractingAttempts: 2,
        earlyStop: true,
        endedNormally: false,
        strictMode: true,
      },
      now: NOW,
    })
    const result = scoreTaskPriorityV2({ taskModelV2: taskModel, linkedObjectiveModelV2: objectiveModel, now: NOW })

    expect(taskModel.completionVerification.decision).toBe('reject_completion')
    expect(result.totalScore).toBeGreaterThan(0)
    expect(['recover', 'split_first', 'clarify_first']).toContain(result.recommendation.recommendedAction)
  })
})
