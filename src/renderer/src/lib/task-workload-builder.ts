import type { PriorityResult } from '@shared/engine-results'
import type { Task } from '@shared/schemas'
import type { TaskWorkload, TaskWorkloadLevel } from '@shared/task-model'
import { estimateMinutesForLevel } from './free-time-calculator'

function complexity(task: Task): NonNullable<Task['complexity']> {
  return task.difficulty ?? task.complexity ?? 'normal'
}

function minutes(task: Task): { estimated: number; remaining: number; completed: number } {
  const estimatedBase = task.estimatedMinutes ?? estimateMinutesForLevel(task.level)
  const remaining = task.status === 'completed' ? 0 : Math.max(0, task.remainingMinutes ?? estimatedBase)
  const estimated = Math.max(estimatedBase, remaining)
  return {
    estimated,
    remaining,
    completed: Math.max(0, estimated - remaining),
  }
}

function workloadLevel(score: number): TaskWorkloadLevel {
  if (score >= 85) return 'extreme'
  if (score >= 65) return 'heavy'
  if (score >= 35) return 'normal'
  return 'light'
}

export type BuildTaskWorkloadInput = {
  task: Task
  priority: PriorityResult
}

export function buildTaskWorkload(args: BuildTaskWorkloadInput): TaskWorkload {
  const taskMinutes = minutes(args.task)
  const taskComplexity = complexity(args.task)
  const shouldBeSplit =
    args.task.status !== 'completed' &&
    (taskComplexity === 'extreme' || taskMinutes.remaining >= 180 || args.priority.complexityScore >= 85)
  const suggestedChunkMinutes =
    taskComplexity === 'extreme'
      ? 75
      : taskComplexity === 'hard'
        ? 60
        : taskMinutes.remaining <= 45
          ? Math.max(15, taskMinutes.remaining)
          : 45
  const reasons: string[] = []
  if (taskMinutes.remaining >= 180) reasons.push('La tâche contient encore beaucoup de minutes à absorber.')
  if (args.priority.complexityScore >= 70) reasons.push('La charge mentale estimée est élevée.')
  if (shouldBeSplit) reasons.push('Il est recommandé de découper la tâche avant de lancer une longue session.')
  if (reasons.length === 0) reasons.push('La charge semble traitable dans une session normale.')

  return {
    estimatedMinutes: taskMinutes.estimated,
    remainingMinutes: taskMinutes.remaining,
    completedMinutes: taskMinutes.completed,
    complexity: taskComplexity,
    complexityScore: args.priority.complexityScore,
    workloadScore: args.priority.workloadScore,
    workloadLevel: workloadLevel(Math.max(args.priority.workloadScore, args.priority.complexityScore)),
    shouldBeSplit,
    suggestedChunkMinutes,
    reasons,
  }
}
