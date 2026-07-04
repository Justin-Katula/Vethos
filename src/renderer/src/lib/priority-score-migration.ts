import type { PriorityResult } from '@shared/engine-results'
import { PRIORITY_SCORE_PERSISTENCE_VERSION, type Objective, type PersistedPriorityScore, type Task } from '@shared/schemas'

/**
 * WARNING: Maps a PriorityResult (which comes from the V1 engine) to a PersistedPriorityScore.
 * Despite the task/objective fields being named `priorityScoreV2` in schemas, they hold
 * this serialized V1 format. Do not mistake this persisted cache for the active V2 scoring structures.
 */
export function toPersistedPriorityScore(result: PriorityResult, computedAt = new Date().toISOString()): PersistedPriorityScore {
  return {
    schemaVersion: PRIORITY_SCORE_PERSISTENCE_VERSION,
    computedAt,
    priorityScore: result.priorityScore,
    urgencyScore: result.urgencyScore,
    valueScore: result.valueScore,
    workloadScore: result.workloadScore,
    complexityScore: result.complexityScore,
    stagnationScore: result.stagnationScore,
    momentumScore: result.momentumScore,
    reasons: result.humanReasons.slice(0, 20),
  }
}

export function samePersistedPriorityScore(left: PersistedPriorityScore | undefined, right: PersistedPriorityScore): boolean {
  if (!left || left.schemaVersion !== right.schemaVersion) return false
  const { computedAt: _leftAt, ...leftMeaning } = left
  const { computedAt: _rightAt, ...rightMeaning } = right
  return JSON.stringify(leftMeaning) === JSON.stringify(rightMeaning)
}

/** Rollback only removes the V2 cache; legacy `level` remains untouched. */
export function rollbackTaskPriorityScore(task: Task): Task {
  const { priorityScoreV2: _score, ...legacy } = task
  return legacy as Task
}

export function rollbackObjectivePriorityScore(objective: Objective): Objective {
  const { priorityScoreV2: _score, ...legacy } = objective
  return legacy as Objective
}
