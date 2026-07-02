import type { Task } from '@shared/schemas'
import type { UserBehaviorEvent } from '@shared/user-model'
import { estimateMinutesForLevel } from './free-time-calculator'

export function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

export function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)))
}

export function localDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number) as [number, number, number]
  return new Date(year, month - 1, day)
}

export function daysBetweenLocalDates(fromDateStr: string, toDateStr: string): number {
  const from = parseLocalDate(fromDateStr)
  const to = parseLocalDate(toDateStr)
  return Math.round((to.getTime() - from.getTime()) / 86_400_000)
}

export function parseClockMinute(value: string | undefined): number | null {
  if (!value) return null
  const match = /^(\d{2}):(\d{2})$/u.exec(value)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  return Math.max(0, Math.min(1439, hours * 60 + minutes))
}

export function minutesUntilDeadline(task: Task, now: Date): number | null {
  const deadlineMinute = parseClockMinute(task.deadlineTime)
  if (deadlineMinute === null) return null
  const deadline = parseLocalDate(task.deadline)
  deadline.setHours(Math.floor(deadlineMinute / 60), deadlineMinute % 60, 0, 0)
  return Math.round((deadline.getTime() - now.getTime()) / 60_000)
}

export function isWithinDays(iso: string | undefined, now: Date, days: number): boolean {
  if (!iso) return false
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return false
  const diff = now.getTime() - date.getTime()
  return diff >= 0 && diff <= days * 86_400_000
}

export function isSameLocalDay(iso: string | undefined, dayKey: string): boolean {
  if (!iso) return false
  return iso.startsWith(dayKey)
}

export function complexity(task: Task): NonNullable<Task['complexity']> {
  return task.difficulty ?? task.complexity ?? 'normal'
}

export function minutes(task: Task): { estimated: number; remaining: number; completed: number } {
  const estimatedBase = task.estimatedMinutes ?? estimateMinutesForLevel(task.level)
  const remaining = task.status === 'completed' ? 0 : Math.max(0, task.remainingMinutes ?? estimatedBase)
  const estimated = Math.max(estimatedBase, remaining)
  return {
    estimated,
    remaining,
    completed: Math.max(0, estimated - remaining),
  }
}

export function relatedEvents(events: UserBehaviorEvent[] | undefined, task: Task): UserBehaviorEvent[] {
  return (events ?? []).filter((event) => {
    if (event.targetType === 'task' && event.targetId === task.id) return true
    if (event.context?.taskId === task.id) return true
    if (task.linkedObjectiveId && event.context?.objectiveId === task.linkedObjectiveId) return true
    return false
  })
}
