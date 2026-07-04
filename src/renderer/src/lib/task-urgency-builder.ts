import type { PriorityResult } from '@shared/engine-results'
import type { Task } from '@shared/schemas'
import type { TaskUrgency, TaskUrgencyLevel } from '@shared/task-model'
import { estimateMinutesForLevel } from './free-time-calculator'

function localDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number) as [number, number, number]
  return new Date(year, month - 1, day)
}

function daysBetweenLocalDates(fromDateStr: string, toDateStr: string): number {
  const from = parseLocalDate(fromDateStr)
  const to = parseLocalDate(toDateStr)
  return Math.round((to.getTime() - from.getTime()) / 86_400_000)
}

function parseClockMinute(value: string | undefined): number | null {
  if (!value) return null
  const match = /^(\d{2}):(\d{2})$/u.exec(value)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  return Math.max(0, Math.min(1439, hours * 60 + minutes))
}

function minutesUntilDeadline(task: Task, now: Date): number | null {
  const deadlineMinute = parseClockMinute(task.deadlineTime)
  if (deadlineMinute === null) return null
  const deadline = parseLocalDate(task.deadline)
  deadline.setHours(Math.floor(deadlineMinute / 60), deadlineMinute % 60, 0, 0)
  return Math.round((deadline.getTime() - now.getTime()) / 60_000)
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

function urgencyLevel(score: number): TaskUrgencyLevel {
  if (score >= 85) return 'critical'
  if (score >= 65) return 'high'
  if (score >= 35) return 'medium'
  return 'low'
}

export type BuildTaskUrgencyInput = {
  task: Task
  priority: PriorityResult
  now: Date
  usableFreeMinutesBeforeDeadline?: number | null
}

export function buildTaskUrgency(args: BuildTaskUrgencyInput): TaskUrgency {
  const today = localDateKey(args.now)
  const daysUntilDeadline = daysBetweenLocalDates(today, args.task.deadline)
  const exactMinutesUntilDeadline = minutesUntilDeadline(args.task, args.now)
  const remaining = minutes(args.task).remaining
  const usable = args.usableFreeMinutesBeforeDeadline ?? null
  const deadlineRiskRatio = usable && usable > 0 ? remaining / usable : Number(args.priority.debug.deadlineRiskRatio ?? null)
  const reasons: string[] = []
  
  if (daysUntilDeadline < 0 || args.task.status === 'expired') reasons.push('La deadline est déjà dépassée.')
  else if (daysUntilDeadline === 0) reasons.push('La deadline est aujourd’hui.')
  else if (daysUntilDeadline <= 3) reasons.push('La deadline arrive bientôt.')
  
  if (deadlineRiskRatio !== null && deadlineRiskRatio >= 0.8) {
    reasons.push('Le temps restant approche ou dépasse le temps libre disponible.')
  }
  if (args.task.deadlineImpact === 'hard') reasons.push('La deadline a une conséquence forte.')
  
  if (reasons.length === 0) reasons.push('La tâche ne montre pas d’urgence forte pour l’instant.')

  return {
    deadline: args.task.deadline,
    deadlineTime: args.task.deadlineTime,
    deadlineImpact: args.task.deadlineImpact ?? 'recoverable',
    daysUntilDeadline,
    minutesUntilDeadline: exactMinutesUntilDeadline,
    usableFreeMinutesBeforeDeadline: usable,
    deadlineRiskRatio,
    urgencyScore: args.priority.urgencyScore,
    urgencyLevel: urgencyLevel(args.priority.urgencyScore),
    reasons,
  }
}
