import type { PlacedBlock, DayCapacity, CognitiveWindow } from './types'
import type { TaskItem, ObjectiveItem, AncreItem } from './types'
import { computeMargin } from './feasibility'
import { computeBreakMinutes } from './rest'

// ═══ PARTIE D — ORDRE DE PLACEMENT ═══════════════════════════════════════

export const TASK_CONSTANTS = {
  maxPercentPerDay: 0.4,
  targetBlockMinutes: 90,
  minBlockMinutes: 25,
  maxDeepBlocksPerDay: 2,
} as const

type TaskWithMeta = TaskItem & { marginMinutes: number; urgency: number; marginStatus: 'comfortable' | 'now' | 'overdue' }

/** D.6 : cascade complète deadline → importance → SRPT → création. */
export function sortTasksByCascade(tasks: TaskItem[], deadlineMinutesMap: Map<string, number>): TaskWithMeta[] {
  return tasks.filter((t) => t.status === 'active').map((t) => {
    const m = computeMargin(deadlineMinutesMap.get(t.id) ?? 0, t.remainingMinutes)
    return { ...t, ...m }
  }).sort((a, b) => {
    if (a.marginMinutes !== b.marginMinutes) return a.marginMinutes - b.marginMinutes
    if (a.importance !== b.importance) return b.importance - a.importance
    if (a.remainingMinutes !== b.remainingMinutes) return a.remainingMinutes - b.remainingMinutes
    return a.createdAt.localeCompare(b.createdAt)
  })
}

/** D.3 : minimum_ancre = MAX(20, 40% × normalMax). */
export function computeAncreMinimum(normalMax: number): number {
  return Math.max(20, Math.round(normalMax * 0.4))
}

/** D.3 : place les ancres à heure fixe. */
export function placeAncres(ancres: AncreItem[], date: string, daySaturated: boolean): PlacedBlock[] {
  return ancres.map((a) => {
    const dur = daySaturated ? a.minimumMinutes : a.normalMaxMinutes
    return {
      id: `ancre-${a.id}-${date}`, date, startMinute: a.anchorMinute, endMinute: a.anchorMinute + dur,
      durationMinutes: dur, kind: 'ancre' as const, refId: a.id, label: a.name, color: a.color,
      cognitiveWindow: 'NORMALE' as const, breakMinutes: 0,
    }
  })
}

/** D.4 : quota quotidien d'un objectif (ajusté par capacité effective). */
export function computeObjectiveQuota(args: {
  objective: ObjectiveItem
  daysRemaining: number
  totalRemainingCapacity: number
  todayCapacity: number
}): number {
  if (args.totalRemainingCapacity <= 0 || args.daysRemaining <= 0) return 0
  return Math.round(args.objective.weeklyTargetMinutes * (1 / args.daysRemaining) * (args.todayCapacity / args.totalRemainingCapacity) * args.daysRemaining)
}

/** D.5 : taille de bloc cible = min(besoin, 90, 40% jour). */
export function computeTargetBlockSize(remaining: number, capacity: number): number {
  return Math.min(remaining, TASK_CONSTANTS.targetBlockMinutes, Math.round(capacity * TASK_CONSTANTS.maxPercentPerDay))
}

/** D.5 : répartition proportionnelle sous pression. */
export function computeProportionalShare(todayCap: number, totalCap: number, totalWork: number): number {
  if (totalCap <= 0) return 0
  return Math.round((todayCap / totalCap) * totalWork)
}

/** D.5 : génère les blocs pour une tâche dans un jour. */
export function placeTaskBlocks(args: {
  task: TaskWithMeta
  date: string
  availableMinutes: number
  slots: DayCapacity['slots']
  deepBlocksToday: number
}): { blocks: PlacedBlock[]; deepBlocksUsed: number; minutesConsumed: number } {
  const blocks: PlacedBlock[] = []
  let remaining = Math.min(args.task.remainingMinutes, args.availableMinutes)
  let deep = args.deepBlocksToday
  let consumed = 0
  let slotIdx = 0
  let slotOffset = 0

  while (remaining > 0 && slotIdx < args.slots.length) {
    const slot = args.slots[slotIdx]!
    const slotAvail = slot.durationMinutes - slotOffset
    if (slotAvail < TASK_CONSTANTS.minBlockMinutes) { slotIdx++; slotOffset = 0; continue }

    let size = Math.min(remaining, TASK_CONSTANTS.targetBlockMinutes, slotAvail)
    const isDeep = size >= TASK_CONSTANTS.targetBlockMinutes
    if (isDeep && deep >= TASK_CONSTANTS.maxDeepBlocksPerDay) {
      size = Math.min(size, 50)
      if (size < TASK_CONSTANTS.minBlockMinutes) break
    }
    if (size < TASK_CONSTANTS.minBlockMinutes) break

    const brk = computeBreakMinutes(size)
    blocks.push({
      id: `task-${args.task.id}-${args.date}-${blocks.length}`,
      date: args.date,
      startMinute: slot.startMinute + slotOffset,
      endMinute: slot.startMinute + slotOffset + size,
      durationMinutes: size, kind: 'task' as const, refId: args.task.id,
      label: args.task.title, color: '#64748b', cognitiveWindow: slot.cognitiveWindow, breakMinutes: brk,
    })
    remaining -= size; consumed += size; slotOffset += size + brk
    if (isDeep) deep++
    if (slotOffset >= slot.durationMinutes) { slotIdx++; slotOffset = 0 }
  }

  return { blocks, deepBlocksUsed: deep - args.deepBlocksToday, minutesConsumed: consumed }
}

/** D.6 : WIP limite = λ × W. */
export function computeWIPLimit(λ: number, W: number): number {
  return λ <= 0 ? 4 : Math.max(1, Math.round(λ * W))
}
