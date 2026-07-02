import type { Objective, Task } from '@shared/schemas'
import { buildObjectivePriorityResult } from './priority-engine'

export type ObjectiveSessionLike = {
  targetType?: 'task' | 'objective' | 'session'
  targetId?: string
  taskId?: string
  objectiveId?: string
  startedAt?: string
  endedAt?: string
  durationMinutes?: number
  status?: string
}

export type ObjectiveStatus = {
  objectiveId: string
  progressPercent: number
  activeTaskId?: string
  nextTaskId?: string
  timeInvestedThisWeek: number
  remainingLinkedWorkMinutes: number
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  stagnationLevel: number
  momentumLevel: number
  avoidanceLevel: number
  deadlineRiskLevel: number
  reasons: string[]
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

function taskMinutes(task: Task): { estimated: number; remaining: number } {
  const estimated = Math.max(0, task.estimatedMinutes ?? task.remainingMinutes ?? 0)
  const remaining = task.status === 'completed' ? 0 : Math.max(0, task.remainingMinutes ?? estimated)
  return { estimated: Math.max(estimated, remaining), remaining }
}

function isThisWeek(iso: string | undefined, now: Date): boolean {
  if (!iso) return false
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return false
  const diffMs = now.getTime() - date.getTime()
  return diffMs >= 0 && diffMs <= 7 * 24 * 60 * 60 * 1000
}

function riskFromScore(score: number): ObjectiveStatus['riskLevel'] {
  if (score >= 85) return 'critical'
  if (score >= 65) return 'high'
  if (score >= 40) return 'medium'
  return 'low'
}

export function buildObjectiveStatus(
  objective: Objective,
  linkedTasks: Task[] = [],
  sessions: ObjectiveSessionLike[] = [],
  now = new Date(),
): ObjectiveStatus {
  const activeTasks = linkedTasks.filter((task) => task.status !== 'completed')
  const completedTasks = linkedTasks.filter((task) => task.status === 'completed')
  const totals = linkedTasks.reduce(
    (acc, task) => {
      const minutes = taskMinutes(task)
      return {
        estimated: acc.estimated + minutes.estimated,
        remaining: acc.remaining + minutes.remaining,
      }
    },
    { estimated: 0, remaining: 0 },
  )
  const progressPercent =
    linkedTasks.length === 0
      ? objective.status === 'completed'
        ? 100
        : 0
      : totals.estimated > 0
        ? clampScore(((totals.estimated - totals.remaining) / totals.estimated) * 100)
        : clampScore((completedTasks.length / linkedTasks.length) * 100)
  const priority = buildObjectivePriorityResult(objective, linkedTasks, {
    recentlyWorkedTargetIds: sessions
      .filter((session) => isThisWeek(session.endedAt ?? session.startedAt, now))
      .flatMap((session) => [session.targetId, session.taskId, session.objectiveId].filter(Boolean) as string[]),
    recentlyCompletedTaskIds: completedTasks
      .filter((task) => isThisWeek(task.completedAt, now))
      .map((task) => task.id),
  })
  const timeInvestedThisWeek = sessions
    .filter((session) => isThisWeek(session.endedAt ?? session.startedAt, now))
    .filter((session) => session.objectiveId === objective.id || session.targetId === objective.id)
    .reduce((sum, session) => sum + (session.durationMinutes ?? 0), 0)
  const sortedTasks = [...activeTasks].sort((a, b) => {
    return buildObjectivePriorityResult(objective, [b]).priorityScore - buildObjectivePriorityResult(objective, [a]).priorityScore
  })
  const reasons: string[] = []
  if (priority.reasonTags.includes('stagnating')) reasons.push('L’objectif montre un risque de stagnation.')
  if (priority.reasonTags.includes('momentum_detected')) reasons.push('Un élan récent existe sur cet objectif.')
  if (totals.remaining > 0) reasons.push('Il reste du travail lié à cet objectif.')

  const abortedSessions = sessions.filter((session) => session.status === 'aborted' && (session.objectiveId === objective.id || session.targetId === objective.id)).length
  const expiredTasks = linkedTasks.filter((task) => task.status === 'expired').length
  const avoidanceLevel = clampScore(abortedSessions * 22 + expiredTasks * 18)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const deadlineRiskLevel = activeTasks.reduce((risk, task) => {
    const deadline = Date.parse(`${task.deadline}T00:00:00`)
    const daysLeft = Number.isFinite(deadline) ? (deadline - today) / 86_400_000 : 30
    const remaining = taskMinutes(task).remaining
    const taskRisk = daysLeft < 0 ? 100 : daysLeft <= 1 ? Math.min(100, 70 + remaining / 6) : daysLeft <= 3 ? Math.min(90, 45 + remaining / 10) : 15
    return Math.max(risk, taskRisk)
  }, 0)
  const detailedRiskScore = Math.max(priority.stagnationScore, avoidanceLevel, deadlineRiskLevel)
  if (avoidanceLevel >= 40) reasons.push('Des abandons ou expirations récents signalent un risque d’évitement.')
  if (deadlineRiskLevel >= 40) reasons.push('Une deadline liée approche au regard du travail restant.')

  return {
    objectiveId: objective.id,
    progressPercent,
    activeTaskId: activeTasks.find((task) => task.status === 'active')?.id,
    nextTaskId: sortedTasks[0]?.id,
    timeInvestedThisWeek,
    remainingLinkedWorkMinutes: totals.remaining,
    riskLevel: riskFromScore(detailedRiskScore),
    stagnationLevel: priority.stagnationScore,
    momentumLevel: priority.momentumScore,
    avoidanceLevel,
    deadlineRiskLevel: clampScore(deadlineRiskLevel),
    reasons,
  }
}
