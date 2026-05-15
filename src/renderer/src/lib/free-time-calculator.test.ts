import { describe, expect, it } from 'vitest'
import {
  computeDayFreeMinutes,
  distributeTimeToTasks,
  formatAllocatedTime,
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
    const entries = [
      entry(custom.id, 540, 600),
      entry(free.id, 600, 660),
    ]

    expect(computeDayFreeMinutes(0, entries, [custom, free])).toBe(1440)
  })

  it('ignores level 0 tasks in the distribution', () => {
    const out = distributeTimeToTasks(
      [task('active', '2026-05-20', 5), task('zero', '2026-05-14', 0)],
      120,
      '2026-05-13',
    )

    expect(out).toEqual([
      expect.objectContaining({ taskId: 'active', allocatedMinutes: 120 }),
    ])
  })

  it('formats allocated time without HH:MM', () => {
    expect(formatAllocatedTime(45)).toBe('45min')
    expect(formatAllocatedTime(150)).toBe('2h30')
  })

  it('keeps rounded allocations reconciled to the full daily free time', () => {
    const out = distributeTimeToTasks(
      [
        task('a', '2026-05-22', 5),
        task('b', '2026-05-15', 4),
        task('c', '2026-05-14', 3),
      ],
      60,
      '2026-05-13',
    )

    expect(out.reduce((sum, item) => sum + item.allocatedMinutes, 0)).toBe(60)
  })
})
