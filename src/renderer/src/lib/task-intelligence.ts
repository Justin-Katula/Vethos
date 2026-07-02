import type { PriorityResult } from '@shared/engine-results'
import type { Objective, Task } from '@shared/schemas'
import { buildTaskPriorityResult } from './priority-engine'

export type TaskStatusResult = {
  taskId: string
  priorityLabel: 'low' | 'medium' | 'high' | 'critical'
  urgencyLabel: 'low' | 'medium' | 'high' | 'critical'
  mentalLoadLabel: 'light' | 'normal' | 'heavy' | 'extreme'
  remainingTimeLabel: string
  riskLabel: string
  recommendedSessionLength: number
  protectionLabel: 'light' | 'normal' | 'strong' | 'strict'
  requiresMandatoryBreak: boolean
  mandatoryBreaks: Array<{ afterMinutes: number; durationMinutes: number; reason: string }>
  reasons: string[]
}

function label(score: number): 'low' | 'medium' | 'high' | 'critical' {
  if (score >= 85) return 'critical'
  if (score >= 65) return 'high'
  if (score >= 35) return 'medium'
  return 'low'
}

function mentalLoad(score: number): TaskStatusResult['mentalLoadLabel'] {
  if (score >= 90) return 'extreme'
  if (score >= 70) return 'heavy'
  if (score >= 40) return 'normal'
  return 'light'
}

function protectionLabel(score: number): TaskStatusResult['protectionLabel'] {
  if (score >= 85) return 'strict'
  if (score >= 65) return 'strong'
  if (score >= 35) return 'normal'
  return 'light'
}

function formatMinutes(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes))
  const hours = Math.floor(safe / 60)
  const rest = safe % 60
  if (hours <= 0) return `${rest} min`
  if (rest === 0) return `${hours}h`
  return `${hours}h${String(rest).padStart(2, '0')}`
}

function sessionLength(priority: PriorityResult): number {
  const remaining = Number(priority.debug.remainingMinutes ?? 0)
  if (priority.urgencyScore >= 85) return Math.min(120, Math.max(90, remaining || 90))
  if (priority.complexityScore >= 90) return Math.min(120, Math.max(75, Number(priority.debug.remainingMinutes ?? 75)))
  if (priority.complexityScore >= 70) return 75
  if (priority.complexityScore >= 45) return 50
  return 35
}

export function buildTaskStatus(
  task: Task,
  linkedObjective?: Objective | null,
  priorityResult?: PriorityResult,
): TaskStatusResult {
  const priority = priorityResult ?? buildTaskPriorityResult(task, linkedObjective)
  const remainingMinutes = Number(priority.debug.remainingMinutes ?? task.remainingMinutes ?? 0)
  const reasons: string[] = []
  if (priority.reasonTags.includes('deadline_today')) reasons.push('Deadline aujourd’hui.')
  if (priority.reasonTags.includes('deadline_soon')) reasons.push('Deadline proche.')
  if (priority.reasonTags.includes('large_remaining_work')) reasons.push('Il reste beaucoup de travail.')
  if (priority.reasonTags.includes('high_complexity')) reasons.push('La charge mentale est élevée.')
  if (priority.reasonTags.includes('almost_completed')) reasons.push('La tâche est presque terminée.')

  const recommendedSessionLength = sessionLength(priority)
  const requiresMandatoryBreak = recommendedSessionLength >= 75 || priority.urgencyScore >= 85
  const mandatoryBreaks = requiresMandatoryBreak
    ? [
        { afterMinutes: recommendedSessionLength >= 90 ? 50 : 45, durationMinutes: 10, reason: priority.urgencyScore >= 85 ? 'Pause maintenue malgré la deadline critique.' : 'Pause obligatoire pour préserver la qualité du travail.' },
        ...(recommendedSessionLength > 105 ? [{ afterMinutes: 100, durationMinutes: 10, reason: 'Deuxième pause obligatoire pour une session longue.' }] : []),
      ]
    : []
  if (requiresMandatoryBreak) reasons.push('La durée recommandée inclut une pause obligatoire.')

  return {
    taskId: task.id,
    priorityLabel: label(priority.priorityScore),
    urgencyLabel: label(priority.urgencyScore),
    mentalLoadLabel: mentalLoad(priority.complexityScore),
    remainingTimeLabel: formatMinutes(remainingMinutes),
    riskLabel: label(Math.max(priority.urgencyScore, priority.stagnationScore)),
    recommendedSessionLength,
    protectionLabel: protectionLabel(Math.max(priority.complexityScore, priority.urgencyScore)),
    requiresMandatoryBreak,
    mandatoryBreaks,
    reasons,
  }
}
