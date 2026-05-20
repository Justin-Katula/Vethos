import { describe, expect, it } from 'vitest'
import {
  applyAutomaticDegradation,
  clampManualLevelChange,
  computeDayFreeMinutes,
  formatAllocatedTime,
  getDeadlineMultiplier,
  getMinimumLevel,
  reconcileLevelZeroTasks,
} from './free-time-calculator'
import type { ScheduleEntry, Task, TimeRule } from '@shared/schemas'

const now = '2026-05-13T00:00:00.000Z'

function rule(id: string, categoryType: TimeRule['categoryType']): TimeRule {
  return {
    id,
    name: categoryType ?? 'custom',
    color: '#3BA3FF',
    categoryType,
    linkedProfileId: null,
    createdAt: now,
  }
}

function entry(ruleId: string, startMinute: number, endMinute: number): ScheduleEntry {
  return {
    id: crypto.randomUUID(),
    ruleId,
    dayOfWeek: 0,
    startMinute,
    endMinute,
    createdAt: now,
  }
}

function task(id: string, deadline: string, level: number): Task {
  return {
    id,
    title: id,
    deadline,
    level,
    status: 'active',
    linkedObjectiveId: null,
    degradationPool: 0,
    totalDegradation: 0,
    createdAt: now,
  }
}

describe('free-time-calculator', () => {
  it('calculates deadline multipliers correctly', () => {
    const today = '2026-05-06'
    expect(getDeadlineMultiplier('2026-05-15', today)).toBe(1.0)
    expect(getDeadlineMultiplier('2026-05-14', today)).toBe(1.0)
    expect(getDeadlineMultiplier('2026-05-13', today)).toBe(1.3)
    expect(getDeadlineMultiplier('2026-05-12', today)).toBe(1.3)
    expect(getDeadlineMultiplier('2026-05-10', today)).toBe(1.3)
    expect(getDeadlineMultiplier('2026-05-09', today)).toBe(1.6)
    expect(getDeadlineMultiplier('2026-05-08', today)).toBe(1.6)
    expect(getDeadlineMultiplier('2026-05-07', today)).toBe(2.0)
    expect(getDeadlineMultiplier('2026-05-06', today)).toBe(2.0)
    expect(getDeadlineMultiplier('2026-05-01', today)).toBe(1.0)
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
    expect(clampManualLevelChange(5, 8)).toBe(7)
    expect(clampManualLevelChange(5, 7)).toBe(7)
    expect(clampManualLevelChange(5, 6)).toBe(6)
    expect(clampManualLevelChange(10, 5)).toBe(8)
    expect(clampManualLevelChange(4, 1)).toBe(2)
    expect(clampManualLevelChange(8, 6)).toBe(6)
  })

  it('subtracts fixed blocks and excludes short preparation before school/work', () => {
    const sleep = rule('11111111-1111-1111-1111-111111111111', 'sleep')
    const school = rule('22222222-2222-2222-2222-222222222222', 'school')
    const entries = [
      entry(sleep.id, 0, 420),
      entry(school.id, 480, 960),
      entry(sleep.id, 1410, 1440),
    ]

    expect(computeDayFreeMinutes(0, entries, [sleep, school])).toBe(420)
  })

  it('subtracts at most 30 minutes before sleep as transition', () => {
    const sleep = rule('33333333-3333-3333-3333-333333333333', 'sleep')
    const entries = [entry(sleep.id, 1320, 1440)]

    expect(computeDayFreeMinutes(0, entries, [sleep])).toBe(1290)
  })

  it('does not subtract custom or explicit free blocks from the real free-time calculation', () => {
    const custom = rule('44444444-4444-4444-4444-444444444444', 'custom')
    const free = rule('55555555-5555-5555-5555-555555555555', 'free')
    const entries = [entry(custom.id, 540, 600), entry(free.id, 600, 660)]

    expect(computeDayFreeMinutes(0, entries, [custom, free])).toBe(1440)
  })



  it('formats allocated time without clock notation', () => {
    expect(formatAllocatedTime(45)).toBe('45min')
    expect(formatAllocatedTime(150)).toBe('2h30')
  })


})

describe('reconcileLevelZeroTasks', () => {
  const TODAY = '2026-05-14'
  function zero(id: string, deadline: string): Task {
    return task(id, deadline, 0)
  }

  it('marque accomplie une tâche niveau 0 dont la deadline est passée', () => {
    const { updated, events } = reconcileLevelZeroTasks([zero('t1', '2026-05-10')], TODAY)
    expect(updated[0]!.status).toBe('history')
    expect(events).toEqual([{ type: 'task-accomplished', taskId: 't1', taskTitle: 't1' }])
  })

  it('force au niveau 3 si deadline < 1 jour', () => {
    const { updated, events } = reconcileLevelZeroTasks([zero('t1', '2026-05-14')], TODAY)
    expect(updated[0]!.level).toBe(3)
    expect(updated[0]!.status).toBe('active')
    expect(events[0]).toMatchObject({ type: 'task-forced-three', taskId: 't1' })
  })

  it('remonte à 1 si 2-6 jours restants', () => {
    for (const days of [2, 4, 6]) {
      const deadline = new Date(2026, 4, 14 + days).toISOString().slice(0, 10)
      const { updated, events } = reconcileLevelZeroTasks([zero('t1', deadline)], TODAY)
      expect(updated[0]!.level).toBe(1)
      expect(events[0]).toMatchObject({ type: 'task-auto-rescued', daysLeft: days })
    }
  })

  it('laisse à 0 si ≥ 7 jours restants', () => {
    const { updated, events } = reconcileLevelZeroTasks([zero('t1', '2026-05-25')], TODAY)
    expect(updated[0]!.level).toBe(0)
    expect(updated[0]!.status).toBe('active')
    expect(events[0]).toMatchObject({ type: 'task-still-zero' })
  })

  it("ne touche pas une tâche dont le niveau n'est pas 0", () => {
    const active = task('t1', '2026-05-15', 5)
    const { updated } = reconcileLevelZeroTasks([active], TODAY)
    expect(updated[0]).toEqual(active)
  })

  it("ne touche pas une tâche déjà 'history'", () => {
    const completed = { ...task('t1', '2026-05-10', 0), status: 'history' as const }
    const { updated } = reconcileLevelZeroTasks([completed], TODAY)
    expect(updated[0]).toEqual(completed)
  })
})
