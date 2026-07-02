import { describe, expect, it } from 'vitest'
import type { Objective, Task } from '@shared/schemas'
import { buildEmptyUserModel } from '@shared/user-model'
import { buildObjectiveModelV2 } from './objective-model-builder'
import { buildPriorityScoreDimensions } from './priority-dimension-builder'
import { buildTaskModelV2 } from './task-model-builder'

const NOW = new Date('2026-06-25T12:00:00.000Z')
const OBJECTIVE_ID = '22222222-2222-4222-8222-222222222222'
const TASK_ID = '11111111-1111-4111-8111-111111111111'

function objective(over: Partial<Objective> = {}): Objective {
  return {
    id: OBJECTIVE_ID,
    name: 'Finir Vethos',
    description: 'Objectif central important',
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
    title: 'Créer PriorityScoreV2',
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

describe('priority-dimension-builder', () => {
  it('donne une importance forte à une tâche liée à un objectif central', () => {
    const obj = objective()
    const t = task()
    const objectiveModel = buildObjectiveModelV2({ objective: obj, linkedTasks: [t], now: NOW })
    const taskModel = buildTaskModelV2({ task: t, objective: obj, objectiveModel, now: NOW })

    const dimensions = buildPriorityScoreDimensions({
      targetType: 'task',
      taskModelV2: taskModel,
      objectiveModelV2: objectiveModel,
      now: NOW,
    })

    expect(dimensions.importanceScore).toBeGreaterThanOrEqual(70)
    expect(dimensions.objectiveImpactScore).toBeGreaterThanOrEqual(70)
  })

  it('monte deadlinePressure quand la deadline est proche et le temps libre faible', () => {
    const taskModel = buildTaskModelV2({
      task: task({ remainingMinutes: 300 }),
      objective: objective(),
      now: NOW,
      usableFreeMinutesBeforeDeadline: 120,
    })

    const dimensions = buildPriorityScoreDimensions({
      targetType: 'task',
      taskModelV2: taskModel,
      planningContext: { usableFreeMinutesBeforeDeadline: 120 },
      now: NOW,
    })

    expect(dimensions.deadlinePressureScore).toBeGreaterThanOrEqual(90)
  })

  it('pénalise une tâche vague', () => {
    const taskModel = buildTaskModelV2({
      task: task({
        title: 'Faire',
        linkedObjectiveId: null,
        complexity: 'unknown',
        contextNotes: undefined,
        estimatedMinutes: undefined,
        remainingMinutes: undefined,
      }),
      objective: null,
      now: NOW,
    })

    const dimensions = buildPriorityScoreDimensions({ targetType: 'task', taskModelV2: taskModel, now: NOW })

    expect(dimensions.ambiguityPenalty).toBeGreaterThanOrEqual(70)
  })

  it('monte avoidance quand l’utilisateur a des signaux faibles récents', () => {
    const userModel = buildEmptyUserModel('user-1', { now: NOW.toISOString() })
    userModel.behaviorEvents = [
      {
        id: 'event-1',
        type: 'unlock_requested',
        targetType: 'task',
        targetId: TASK_ID,
        createdAt: '2026-06-25T10:00:00.000Z',
      },
      {
        id: 'event-2',
        type: 'session_aborted',
        targetType: 'task',
        targetId: TASK_ID,
        createdAt: '2026-06-24T10:00:00.000Z',
      },
    ]
    const taskModel = buildTaskModelV2({ task: task(), objective: objective(), userModel, now: NOW })

    const dimensions = buildPriorityScoreDimensions({ targetType: 'task', taskModelV2: taskModel, userModel, now: NOW })

    expect(dimensions.avoidanceScore).toBeGreaterThanOrEqual(30)
  })

  it('garde une tâche presque terminée visible grâce au besoin de finition', () => {
    const taskModel = buildTaskModelV2({
      task: task({ estimatedMinutes: 240, remainingMinutes: 20, complexity: 'normal' }),
      objective: objective(),
      now: NOW,
    })

    const dimensions = buildPriorityScoreDimensions({ targetType: 'task', taskModelV2: taskModel, now: NOW })

    expect(dimensions.momentumScore).toBeGreaterThanOrEqual(60)
    expect(dimensions.progressNeedScore).toBeGreaterThanOrEqual(60)
  })

  it('ne considère pas une claim completed non vérifiée comme une vraie fin', () => {
    const taskModel = buildTaskModelV2({
      task: task(),
      objective: objective(),
      completionClaim: {
        userClaimedCompleted: true,
        progressClaim: 'completed',
        summary: 'fini',
      },
      completionSessionEvidence: {
        durationMinutes: 8,
        usefulActivityMinutes: 1,
        unlockRequests: 2,
        distractingAttempts: 2,
        earlyStop: true,
        endedNormally: false,
        strictMode: true,
      },
      now: NOW,
    })

    const dimensions = buildPriorityScoreDimensions({ targetType: 'task', taskModelV2: taskModel, now: NOW })

    expect(taskModel.completionVerification.verifiedCompleted).toBe(false)
    expect(dimensions.completionReliabilityScore).toBeLessThan(50)
  })
})
