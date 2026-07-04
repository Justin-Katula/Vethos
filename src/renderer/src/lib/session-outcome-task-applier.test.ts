import { describe, expect, it } from 'vitest'
import type { CompletionGateResult } from '@shared/completion-gate'
import type { SessionOutcomeV2 } from '@shared/session-model'
import type { Task } from '@shared/schemas'
import { applySessionOutcomeToTask } from './session-outcome-task-applier'

const task = {
  id: '11111111-1111-4111-8111-111111111111', title: 'Generic task', linkedObjectiveId: null,
  deadline: '2026-07-10', level: 5, status: 'active', remainingMinutes: 20,
  createdAt: '2026-07-01T00:00:00.000Z',
} satisfies Task

const outcome = {
  sessionId: 'session-1', outcome: 'completion_verified', verifiedProgressMinutes: 20,
  shouldReduceRemainingMinutes: true, shouldMarkTaskCompleted: true, completionAccepted: true,
  reasons: [], warnings: [], confidence: 90,
} satisfies SessionOutcomeV2

describe('session outcome task applier', () => {
  it('rejects a completion signal without a matching verified gate', () => {
    expect(() => applySessionOutcomeToTask(task, outcome)).toThrow('completion gate')
  })

  it('applies completion only with the matching verified gate', () => {
    const gate = {
      taskId: task.id, sessionId: outcome.sessionId, verifiedCompleted: true,
      decision: 'accept_completion', verifiedAt: '2026-07-02T12:00:00.000Z',
    } as CompletionGateResult
    expect(applySessionOutcomeToTask(task, outcome, gate)).toEqual(expect.objectContaining({
      status: 'completed', remainingMinutes: 0, completedAt: gate.verifiedAt,
    }))
  })

  it('reduces verified progress without silently completing the task', () => {
    const partial: SessionOutcomeV2 = {
      ...outcome, outcome: 'partial_progress', verifiedProgressMinutes: 50,
      shouldMarkTaskCompleted: false, completionAccepted: false,
    }
    expect(applySessionOutcomeToTask(task, partial)).toEqual(expect.objectContaining({
      status: 'active', remainingMinutes: 1,
    }))
  })
})
