import { describe, it, expect } from 'vitest'
import {
  getDeadlineMultiplier,
  distributeFreeTime,
  getMinimumLevel,
  applyAutomaticDegradation,
  clampManualLevelChange,
  reconcileLevelZeroTasks,
} from './level-distribution'
import type { Task } from '@shared/schemas'

describe('Level Distribution Engine', () => {
  it('calculates deadline multipliers correctly', () => {
    const today = '2026-05-06'
    expect(getDeadlineMultiplier('2026-05-15', today)).toBe(1.0) // > 7
    expect(getDeadlineMultiplier('2026-05-14', today)).toBe(1.0) // = 8
    expect(getDeadlineMultiplier('2026-05-13', today)).toBe(1.3) // = 7
    expect(getDeadlineMultiplier('2026-05-12', today)).toBe(1.3) // 6 days
    expect(getDeadlineMultiplier('2026-05-10', today)).toBe(1.3) // 4 days
    expect(getDeadlineMultiplier('2026-05-09', today)).toBe(1.6) // 3 days
    expect(getDeadlineMultiplier('2026-05-08', today)).toBe(1.6) // 2 days
    expect(getDeadlineMultiplier('2026-05-07', today)).toBe(2.0) // 1 day
    expect(getDeadlineMultiplier('2026-05-06', today)).toBe(2.0) // today
    expect(getDeadlineMultiplier('2026-05-01', today)).toBe(1.0) // overdue
  })

  it('distributes free time correctly and rounds to 5 mins', () => {
    const tasks: Task[] = [
      task('1', 'A', '2026-05-15', 5), // diff 9 -> 1.0 * 5 = 5
      task('2', 'B', '2026-05-08', 4), // diff 2 -> 1.6 * 4 = 6.4
      task('3', 'C', '2026-05-07', 3), // diff 1 -> 2.0 * 3 = 6
    ]
    // Total score = 5 + 6.4 + 6 = 17.4
    // Task 1: 5 / 17.4 * 60 = 17.24 -> 15 min
    // Task 2: 6.4 / 17.4 * 60 = 22.06 -> 20 min + 5 min rounding reconciliation
    // Task 3: 6 / 17.4 * 60 = 20.68 -> 20 min
    const results = distributeFreeTime(tasks, 60, '2026-05-06')
    expect(results).toEqual([
      { taskId: '1', scoreReel: 5, minutes: 15 },
      { taskId: '2', scoreReel: 6.4, minutes: 25 },
      { taskId: '3', scoreReel: 6, minutes: 20 }
    ])
  })

  it('handles minimum levels', () => {
    expect(getMinimumLevel(10)).toBe(3)
    expect(getMinimumLevel(9)).toBe(2)
    expect(getMinimumLevel(8)).toBe(1)
    expect(getMinimumLevel(7)).toBe(0)
    expect(getMinimumLevel(5)).toBe(0)
  })

  it('applies automatic degradation', () => {
    expect(applyAutomaticDegradation(5)).toBe(4.5)
    expect(applyAutomaticDegradation(10)).toBe(9.5)
    expect(applyAutomaticDegradation(8)).toBe(7.5)
  })

  it('clamps manual level changes to max +/- 2', () => {
    expect(clampManualLevelChange(5, 8)).toBe(7) // +2 max
    expect(clampManualLevelChange(5, 7)).toBe(7) // exactly +2
    expect(clampManualLevelChange(5, 6)).toBe(6) // +1
    expect(clampManualLevelChange(10, 5)).toBe(8) // -2 max
    expect(clampManualLevelChange(4, 1)).toBe(2) // -2 max
    // Check floors
    expect(clampManualLevelChange(8, 6)).toBe(6) // Wait, min for 8 is 1, so 6 is fine
    // Wait, the minimum floor depends on the INITIAL level when changing manually?
    // "Niveau 10 -> minimum 3". This applies to absolute floor.
  })
})

function task(id: string, title: string, deadline: string, level: number): Task {
  return {
    id,
    title,
    deadline,
    level,
    status: 'active',
    createdAt: '',
    linkedObjectiveId: null,
    degradationPool: 0,
    totalDegradation: 0,
  }
}

// ─── reconcileLevelZeroTasks (V2 P9) ────────────────────────────────────────

describe('reconcileLevelZeroTasks', () => {
  const TODAY = '2026-05-14'
  function zero(id: string, deadline: string): Task {
    return task(id, `Test ${id}`, deadline, 0)
  }

  it('marque accomplie une tâche niveau 0 dont la deadline est passée', () => {
    const { updated, events } = reconcileLevelZeroTasks(
      [zero('t1', '2026-05-10')],
      TODAY,
    )
    expect(updated[0]!.status).toBe('history')
    expect(events).toEqual([
      { type: 'task-accomplished', taskId: 't1', taskTitle: 'Test t1' },
    ])
  })

  it('force au niveau 3 si deadline < 1 jour', () => {
    const { updated, events } = reconcileLevelZeroTasks(
      [zero('t1', '2026-05-14')], // 0 jour restant
      TODAY,
    )
    expect(updated[0]!.level).toBe(3)
    expect(updated[0]!.status).toBe('active')
    expect(events[0]).toMatchObject({ type: 'task-forced-three', taskId: 't1' })
  })

  it('remonte à 1 si 2-6 jours restants', () => {
    for (const days of [2, 4, 6]) {
      const deadline = new Date(2026, 4, 14 + days).toISOString().slice(0, 10)
      const { updated, events } = reconcileLevelZeroTasks(
        [zero('t1', deadline)],
        TODAY,
      )
      expect(updated[0]!.level).toBe(1)
      expect(events[0]).toMatchObject({ type: 'task-auto-rescued', daysLeft: days })
    }
  })

  it('laisse à 0 si ≥ 7 jours restants', () => {
    const { updated, events } = reconcileLevelZeroTasks(
      [zero('t1', '2026-05-25')], // 11 jours
      TODAY,
    )
    expect(updated[0]!.level).toBe(0)
    expect(updated[0]!.status).toBe('active')
    expect(events[0]).toMatchObject({ type: 'task-still-zero' })
  })

  it("ne touche pas une tâche dont le niveau n'est pas 0", () => {
    const t = task('t1', 'Test t1', '2026-05-15', 5)
    const { updated } = reconcileLevelZeroTasks([t], TODAY)
    expect(updated[0]).toEqual(t)
  })

  it("ne touche pas une tâche déjà 'history'", () => {
    const t = { ...task('t1', 'Test t1', '2026-05-10', 0), status: 'history' as const }
    const { updated } = reconcileLevelZeroTasks([t], TODAY)
    expect(updated[0]).toEqual(t)
  })
})
