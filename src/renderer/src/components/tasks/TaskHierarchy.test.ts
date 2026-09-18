import { describe, it, expect } from 'vitest'
import { groupTasks, duration } from './TaskHierarchy'
import type { TaskItem } from '@shared/planning/types'

describe('TaskHierarchy — groupTasks', () => {
  const baseTask: TaskItem = {
    id: 't-root-1',
    title: 'MOI',
    plan: 'Plan de travail pour MOI',
    deadline: '2026-08-30',
    importance: 5,
    category: 'général',
    workKind: 'routine',
    estimatedMinutes: 180,
    remainingMinutes: 0,
    correctionFactor: 1.4,
    parentTaskId: null,
    partOrder: null,
    extraMinutes: 0,
    appsToBlock: [],
    status: 'active',
    createdAt: '2026-08-23T10:00:00.000Z',
  }

  it('regroupe correctement une tâche découpée en parties sous son titre parent', () => {
    const part1: TaskItem = {
      ...baseTask,
      id: 't-part-1',
      title: 'MOI — Partie 1',
      parentTaskId: 't-root-1',
      partOrder: 1,
      estimatedMinutes: 60,
      remainingMinutes: 60,
    }
    const part2: TaskItem = {
      ...baseTask,
      id: 't-part-2',
      title: 'MOI — Partie 2',
      parentTaskId: 't-root-1',
      partOrder: 2,
      estimatedMinutes: 60,
      remainingMinutes: 60,
    }
    const part3: TaskItem = {
      ...baseTask,
      id: 't-part-3',
      title: 'MOI — Partie 3',
      parentTaskId: 't-root-1',
      partOrder: 3,
      estimatedMinutes: 60,
      remainingMinutes: 60,
    }

    const singleTask: TaskItem = {
      ...baseTask,
      id: 't-single',
      title: 'Rapport financier',
      estimatedMinutes: 45,
      remainingMinutes: 45,
    }

    const allTasks = [baseTask, part1, part2, part3, singleTask]
    const groups = groupTasks(allTasks, { 't-part-1': 30 })

    expect(groups).toHaveLength(2)

    // Premier groupe : MOI
    const moiGroup = groups.find((g) => g.root.id === 't-root-1')!
    expect(moiGroup).toBeDefined()
    expect(moiGroup.isSplit).toBe(true)
    expect(moiGroup.root.title).toBe('MOI')
    expect(moiGroup.parts).toHaveLength(3)
    expect(moiGroup.parts.map((p) => p.partOrder)).toEqual([1, 2, 3])
    expect(moiGroup.totalEstimatedMinutes).toBe(180)
    expect(moiGroup.totalWorkedMinutes).toBe(30)
    expect(moiGroup.totalRemainingMinutes).toBe(150)

    // Deuxième groupe : Tâche seule
    const singleGroup = groups.find((g) => g.root.id === 't-single')!
    expect(singleGroup).toBeDefined()
    expect(singleGroup.isSplit).toBe(false)
    expect(singleGroup.parts).toHaveLength(0)
    expect(singleGroup.totalRemainingMinutes).toBe(45)
  })

  it('formate correctement les durées en heures et minutes', () => {
    expect(duration(45)).toBe('45 min')
    expect(duration(60)).toBe('1 h')
    expect(duration(90)).toBe('1 h 30')
    expect(duration(125)).toBe('2 h 05')
  })
})
