import type { PriorityResult } from '@shared/engine-results'
import type { Task } from '@shared/schemas'
import type { TaskProgressV2, TaskRisk, TaskRiskLevel, TaskUrgency, TaskWorkload } from '@shared/task-model'
import type { UserBehaviorEvent, UserModel } from '@shared/user-model'
import { clampScore, complexity, isWithinDays, relatedEvents } from './task-model-utils'

function riskLevel(score: number): TaskRiskLevel {
  if (score >= 85) return 'critical'
  if (score >= 65) return 'high'
  if (score >= 40) return 'medium'
  return 'low'
}

function avoidanceScore(events: UserBehaviorEvent[] | undefined, task: Task, now: Date): number {
  const riskyEvents = relatedEvents(events, task).filter((event) => {
    if (!isWithinDays(event.createdAt, now, 14)) return false
    return ['task_skipped', 'session_aborted', 'recommendation_rejected', 'unlock_requested'].includes(event.type)
  })
  return clampScore(riskyEvents.length * 18)
}

function interruptionScore(events: UserBehaviorEvent[] | undefined, task: Task, now: Date): number {
  const interruptionEvents = relatedEvents(events, task).filter((event) => {
    if (!isWithinDays(event.createdAt, now, 7)) return false
    return ['app_opened_during_session', 'site_opened_during_session', 'unlock_requested'].includes(event.type)
  })
  return clampScore(interruptionEvents.length * 14)
}

export type BuildTaskRiskInput = {
  task: Task
  workload: TaskWorkload
  urgency: TaskUrgency
  progress: TaskProgressV2
  priority: PriorityResult
  userModel?: UserModel | null
  now: Date
}

export function buildTaskRisk(args: BuildTaskRiskInput): TaskRisk {
  const titleWords = args.task.title.trim().split(/\s+/u).filter(Boolean).length
  const ambiguityRiskScore = clampScore(
    (complexity(args.task) === 'unknown' ? 55 : 0) +
      (!args.task.contextNotes && titleWords <= 2 ? 30 : 0) +
      (args.task.estimatedMinutes === undefined && args.task.remainingMinutes === undefined ? 15 : 0),
  )
  const workloadRiskScore = clampScore(Math.max(args.workload.workloadScore, args.workload.complexityScore))
  const avoidanceRiskScore = avoidanceScore(args.userModel?.behaviorEvents, args.task, args.now)
  const interruptionRiskScore = interruptionScore(args.userModel?.behaviorEvents, args.task, args.now)
  const deadlineRiskScore = args.urgency.urgencyScore
  const overallRiskScore = clampScore(
    Math.max(
      deadlineRiskScore,
      avoidanceRiskScore,
      0.3 * deadlineRiskScore +
        0.25 * workloadRiskScore +
        0.2 * args.progress.stagnationScore +
        0.15 * ambiguityRiskScore +
        0.1 * interruptionRiskScore,
    ),
  )
  const reasons: string[] = []
  const warnings: string[] = []
  
  if (deadlineRiskScore >= 65) reasons.push('La deadline donne une vraie pression à cette tâche.')
  if (workloadRiskScore >= 70) reasons.push('La charge de travail est élevée.')
  if (ambiguityRiskScore >= 60) warnings.push('La tâche manque de clarté ou d’estimation fiable.')
  if (avoidanceRiskScore >= 45) reasons.push('Des signaux indiquent que cette tâche a été évitée récemment.')
  if (interruptionRiskScore >= 45) warnings.push('Le contexte de session a déjà attiré des distractions.')
  
  if (reasons.length === 0) reasons.push('Risque modéré ou faible, pas de menace immédiate détectée.')

  return {
    riskLevel: riskLevel(overallRiskScore),
    overallRiskScore,
    deadlineRiskScore,
    workloadRiskScore,
    ambiguityRiskScore,
    avoidanceRiskScore,
    interruptionRiskScore,
    reasons,
    warnings,
  }
}
