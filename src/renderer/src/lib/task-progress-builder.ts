import type { PriorityResult } from '@shared/engine-results'
import type { Task } from '@shared/schemas'
import type { TaskProgressV2 } from '@shared/task-model'
import { clampScore, isSameLocalDay, isWithinDays, localDateKey, minutes } from './task-model-utils'

export type TaskModelSessionLike = {
  targetType?: 'task' | 'objective' | 'session'
  targetId?: string
  taskId?: string
  objectiveId?: string
  startedAt?: string
  endedAt?: string
  durationMinutes?: number
}

export type BuildTaskProgressInput = {
  task: Task
  sessions: TaskModelSessionLike[]
  priority: PriorityResult
  now: Date
}

export function buildTaskProgress(args: BuildTaskProgressInput): TaskProgressV2 {
  const today = localDateKey(args.now)
  const taskMinutes = minutes(args.task)
  const progressPercent =
    args.task.status === 'completed'
      ? 100
      : taskMinutes.estimated > 0
        ? clampScore((taskMinutes.completed / taskMinutes.estimated) * 100)
        : 0
  const relatedSessions = args.sessions.filter((session) => {
    return session.taskId === args.task.id || session.targetId === args.task.id
  })
  const investedMinutesToday = relatedSessions
    .filter((session) => isSameLocalDay(session.endedAt ?? session.startedAt, today))
    .reduce((sum, session) => sum + (session.durationMinutes ?? 0), 0)
  const investedMinutesThisWeek = relatedSessions
    .filter((session) => isWithinDays(session.endedAt ?? session.startedAt, args.now, 7))
    .reduce((sum, session) => sum + (session.durationMinutes ?? 0), 0)
  const investedMinutesTotal = relatedSessions.reduce((sum, session) => sum + (session.durationMinutes ?? 0), 0)
  const reasons: string[] = []
  
  if (progressPercent >= 85) reasons.push('La tâche est presque terminée.')
  if (investedMinutesThisWeek > 0) reasons.push('Il y a eu du travail récent sur cette tâche.')
  if (args.priority.stagnationScore >= 60) reasons.push('La tâche montre un risque de stagnation.')
  if (reasons.length === 0) reasons.push('Aucun signal de progression récent fort.')

  return {
    progressPercent,
    investedMinutesToday,
    investedMinutesThisWeek,
    investedMinutesTotal,
    momentumScore: Math.max(args.priority.momentumScore, investedMinutesThisWeek > 0 ? 55 : 0),
    stagnationScore: args.priority.stagnationScore,
    reasons,
  }
}
