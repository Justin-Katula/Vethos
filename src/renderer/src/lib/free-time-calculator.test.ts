import { describe, expect, it } from 'vitest'
import {
  applyAutomaticDegradation,
  applyObjectiveProgressToTasks,
  clampManualLevelChange,
  computeDayFreeMinutes,
  computeFreeTimeSlots,
  formatAllocatedTime,
  getDeadlineMultiplier,
  getMinimumLevel,
  reconcileObjectiveQueuesOnly,
  reconcileActiveTasks,
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
    estimatedMinutes: 30,
    remainingMinutes: 30,
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
    expect(getDeadlineMultiplier('2026-05-07', today)).toBe(2)
    expect(getDeadlineMultiplier('2026-05-06', today)).toBe(0)
    expect(getDeadlineMultiplier('2026-05-01', today)).toBe(0)
  })

  it('ignore deadlineImpact dans le multiplicateur central', () => {
    const today = '2026-05-06'
    expect(getDeadlineMultiplier('2026-05-07', today, 'hard')).toBe(2)
    expect(getDeadlineMultiplier('2026-05-09', today, 'hard')).toBe(1.6)
    expect(getDeadlineMultiplier('2026-05-13', today, 'hard')).toBe(1.3)
    expect(getDeadlineMultiplier('2026-05-01', today, 'hard')).toBe(0)
  })



  it('handles minimum levels', () => {
    expect(getMinimumLevel(10)).toBe(3)
    expect(getMinimumLevel(9)).toBe(2)
    expect(getMinimumLevel(8)).toBe(1)
    expect(getMinimumLevel(7)).toBe(0)
    expect(getMinimumLevel(5)).toBe(0)
  })

  it('applies automatic degradation', () => {
    expect(applyAutomaticDegradation(5)).toBe(4)
    expect(applyAutomaticDegradation(10)).toBe(9)
    expect(applyAutomaticDegradation(8)).toBe(7)
  })

  it('clamps manual level changes to max +/- 2', () => {
    expect(clampManualLevelChange(5, 8)).toBe(7)
    expect(clampManualLevelChange(5, 7)).toBe(7)
    expect(clampManualLevelChange(5, 6)).toBe(6)
    expect(clampManualLevelChange(10, 5)).toBe(8)
    expect(clampManualLevelChange(4, 1)).toBe(2)
    expect(clampManualLevelChange(8, 6)).toBe(6)
  })

  it('subtracts fixed blocks, preparation, post-school rest and sleep transition', () => {
    const sleep = rule('11111111-1111-1111-1111-111111111111', 'sleep')
    const school = rule('22222222-2222-2222-2222-222222222222', 'school')
    const entries = [
      entry(sleep.id, 0, 420),
      entry(school.id, 480, 960),
      entry(sleep.id, 1410, 1440),
    ]

    expect(computeDayFreeMinutes(0, entries, [sleep, school])).toBe(390)
  })

  it('protège 30 minutes après travail/école avant les tâches et objectifs', () => {
    const work = rule('66666666-6666-6666-6666-666666666666', 'work')
    const slots = computeFreeTimeSlots(0, [entry(work.id, 540, 1020)], [work])

    expect(slots.find((slot) => !slot.isPreparation && slot.startMinute >= 1020)).toMatchObject({
      startMinute: 1050,
      endMinute: 1440,
    })
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

  it('removes the 30-minute morning buffer after wake-up', () => {
    const slots = computeFreeTimeSlots(0, [], [], { wakeMinute: 420 })
    expect(slots.filter((slot) => !slot.isPreparation)[0]).toMatchObject({
      startMinute: 450,
      endMinute: 1440,
    })
  })



  it('formats allocated time without clock notation', () => {
    expect(formatAllocatedTime(45)).toBe('45min')
    expect(formatAllocatedTime(150)).toBe('2h30')
  })


})

describe('reconcileActiveTasks', () => {
  const TODAY = '2026-05-14'
  function zero(id: string, deadline: string): Task {
    return task(id, deadline, 0)
  }

  it('marque expired une tâche dont la deadline est atteinte avec du temps restant', () => {
    const { updated, events } = reconcileActiveTasks(
      [zero('t1', '2026-05-10')],
      TODAY,
      new Date('2026-05-14T12:00:00.000Z'),
    )
    expect(updated[0]!.status).toBe('expired')
    expect(events).toEqual([{ type: 'task-expired', taskId: 't1', taskTitle: 't1' }])
  })

  it('marque completed une tâche sans temps restant', () => {
    const done = { ...task('t1', '2026-05-15', 5), remainingMinutes: 0 }
    const { updated, events } = reconcileActiveTasks([done], TODAY)
    expect(updated[0]!.status).toBe('completed')
    expect(events[0]).toMatchObject({ type: 'task-completed', taskId: 't1' })
  })

  it('dégrade le niveau de 1 toutes les 48h tant que la tâche est active', () => {
    const active = {
      ...task('t1', '2026-05-25', 5),
      createdAt: '2026-05-10T00:00:00.000Z',
    }
    const { updated, events } = reconcileActiveTasks(
      [active],
      TODAY,
      new Date('2026-05-14T00:00:00.000Z'),
    )
    expect(updated[0]!.level).toBe(3)
    expect(events[0]).toMatchObject({ type: 'task-auto-degraded', oldLevel: 5, newLevel: 3 })
  })

  it("ne touche pas une tâche active avant 48h et avant sa deadline", () => {
    const active = task('t1', '2026-05-25', 5)
    const { updated, events } = reconcileActiveTasks(
      [active],
      TODAY,
      new Date('2026-05-13T23:00:00.000Z'),
    )
    expect(updated[0]).toEqual(active)
    expect(events).toEqual([])
  })

  it("ne touche pas une tâche dont le statut n'est pas active", () => {
    const completed = { ...task('t1', '2026-05-10', 0), status: 'completed' as const }
    const { updated } = reconcileActiveTasks([completed], TODAY)
    expect(updated[0]).toEqual(completed)
  })

  it('respecte une deadlineTime future le jour même', () => {
    const active = {
      ...task('t1', TODAY, 5),
      deadlineTime: '17:00',
    }
    const { updated } = reconcileActiveTasks(
      [active],
      TODAY,
      new Date('2026-05-14T10:00:00.000Z'),
    )
    expect(updated[0]!.status).toBe('active')
  })

  it('gèle les tâches liées non prioritaires dans une file objectif', () => {
    const low = { ...task('low', '2026-05-15', 1), linkedObjectiveId: 'o1' }
    const high = { ...task('high', '2026-05-17', 10), linkedObjectiveId: 'o1' }
    const { updated, events } = reconcileObjectiveQueuesOnly(
      [low, high],
      TODAY,
      new Date('2026-05-14T08:00:00.000Z'),
    )
    expect(updated.find((t) => t.id === 'high')?.status).toBe('active')
    expect(updated.find((t) => t.id === 'low')).toMatchObject({
      status: 'queued',
      frozenDeadlineOffsetDays: 3,
    })
    expect(events).toContainEqual({
      type: 'task-queued',
      taskId: 'low',
      taskTitle: 'low',
      objectiveId: 'o1',
    })
  })

  it('active la prochaine tâche gelée avec une deadline relative', () => {
    const active = { ...task('active', '2026-05-15', 5), linkedObjectiveId: 'o1', remainingMinutes: 0 }
    const queued = {
      ...task('queued', '2026-05-20', 5),
      status: 'queued' as const,
      linkedObjectiveId: 'o1',
      frozenDeadlineOffsetDays: 3,
    }
    const { updated, events } = reconcileActiveTasks(
      [active, queued],
      TODAY,
      new Date('2026-05-14T08:00:00.000Z'),
    )
    expect(updated.find((t) => t.id === 'queued')).toMatchObject({
      status: 'active',
      deadline: '2026-05-17',
    })
    expect(events.some((event) => event.type === 'task-activated' && event.taskId === 'queued')).toBe(true)
  })

  it('déduit le travail objectif de la tâche active liée', () => {
    const active = { ...task('active', '2026-05-20', 5), linkedObjectiveId: 'o1', remainingMinutes: 20 }
    const queued = {
      ...task('queued', '2026-05-22', 5),
      status: 'queued' as const,
      linkedObjectiveId: 'o1',
      remainingMinutes: 30,
      frozenDeadlineOffsetDays: 4,
    }
    const { updated } = applyObjectiveProgressToTasks(
      [active, queued],
      [{ objectiveId: 'o1', minutes: 25 }],
      TODAY,
      new Date('2026-05-14T08:00:00.000Z'),
    )
    expect(updated.find((t) => t.id === 'active')).toMatchObject({
      status: 'completed',
      remainingMinutes: 0,
    })
    expect(updated.find((t) => t.id === 'queued')).toMatchObject({
      status: 'active',
      remainingMinutes: 25,
    })
  })
})
