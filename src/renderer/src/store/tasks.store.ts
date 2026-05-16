import { create } from 'zustand'
import { nexus } from '@/lib/ipc'
import type { Task, TasksState } from '@shared/schemas'
import {
  clampManualLevelChange,
  getMinimumLevel,
  reconcileLevelZeroTasks,
} from '@/lib/level-distribution'
import { assertStorageWrite } from '@/lib/storage-write'
import { useToastStore } from './toast.store'

type TasksStore = {
  loaded: boolean
  tasks: Task[]

  load: () => Promise<void>
  addTask: (title: string, deadline: string, linkedObjectiveId: string | null) => Promise<Task>
  saveTask: (draft: Partial<Task> & { title: string, deadline: string }) => Promise<Task>
  deleteTask: (id: string) => Promise<void>
  markTaskCompleted: (id: string) => Promise<void>
  updateTaskLevel: (id: string, newLevel: number) => Promise<void>
  applySessionDegradation: (completedTaskIds: string[]) => Promise<void>
  /**
   * V2 P9 — Réconcilie les tâches au niveau 0 selon leur deadline.
   * Appelée au boot et lors des changements de jour. Fire des notifs
   * natives via IPC pour chaque changement.
   */
  reconcileLevelZero: (todayStr: string) => Promise<void>
}

function uuid(): string {
  return crypto.randomUUID()
}

async function persistTasks(tasks: Task[]): Promise<void> {
  const result = await nexus.storage.write<TasksState>('tasks', { tasks })
  try {
    assertStorageWrite(result, 'tasks')
  } catch (err) {
    useToastStore.getState().push({
      variant: 'error',
      title: 'Sauvegarde tâches échouée',
      description: err instanceof Error ? err.message : String(err),
    })
    throw err
  }
}

export const useTasksStore = create<TasksStore>((set, get) => ({
  loaded: false,
  tasks: [],

  async load() {
    const stored = await nexus.storage.read<TasksState>('tasks')
    if (stored) {
      set({ loaded: true, tasks: stored.tasks })
    } else {
      set({ loaded: true, tasks: [] })
    }
  },

  async addTask(title, deadline, linkedObjectiveId) {
    const newTask: Task = {
      id: uuid(),
      title,
        deadline,
        linkedObjectiveId,
        level: 5,
        degradationPool: 0,
        totalDegradation: 0,
        status: 'active',
        createdAt: new Date().toISOString()
    }
    const newTasks = [...get().tasks, newTask]
    set({ tasks: newTasks })
    await persistTasks(newTasks)
    return newTask
  },

  async saveTask(draft) {
    let tasks = get().tasks
    let saved: Task
    if (draft.id) {
      tasks = tasks.map(t => {
        if (t.id === draft.id) {
           saved = { ...t, ...draft } as Task
           return saved
        }
        return t
      })
      // If it somehow wasn't found, fallback
      if (!saved!) {
         saved = {
           id: draft.id,
           title: draft.title,
           deadline: draft.deadline,
           linkedObjectiveId: draft.linkedObjectiveId ?? null,
           level: draft.level ?? 5,
           degradationPool: draft.degradationPool ?? 0,
           totalDegradation: draft.totalDegradation ?? 0,
           status: draft.status ?? 'active',
           createdAt: draft.createdAt ?? new Date().toISOString()
         }
         tasks.push(saved)
      }
    } else {
      saved = {
        id: uuid(),
        title: draft.title,
        deadline: draft.deadline,
        linkedObjectiveId: draft.linkedObjectiveId ?? null,
        level: draft.level ?? 5,
        degradationPool: draft.degradationPool ?? 0,
        totalDegradation: draft.totalDegradation ?? 0,
        status: 'active',
        createdAt: new Date().toISOString()
      }
      tasks = [...tasks, saved]
    }
    set({ tasks })
    await persistTasks(tasks)
    return saved!
  },

  async deleteTask(id) {
    const tasks = get().tasks.filter(t => t.id !== id)
    set({ tasks })
    await persistTasks(tasks)
  },

  async markTaskCompleted(id) {
    const tasks = get().tasks.map(t => t.id === id ? { ...t, status: 'history' as const } : t)
    set({ tasks })
    await persistTasks(tasks)
  },

  async updateTaskLevel(id, desiredLevel) {
    const tasks = get().tasks.map(t => {
      if (t.id !== id) return t
      if (!canChangeLevel(t.lastLevelChangeAt)) return t
      const safeLevel = clampManualLevelChange(t.level, desiredLevel)
      return { 
        ...t, 
        level: safeLevel,
        lastLevelChangeAt: new Date().toISOString(),
      }
    })
    set({ tasks })
    await persistTasks(tasks)
  },

  async applySessionDegradation(completedTaskIds) {
    const degradedEvents: Array<{ title: string; newLevel: number; hitZero: boolean }> = []
    const tasks = get().tasks.map(t => {
      if (!completedTaskIds.includes(t.id)) return t
      if (t.totalDegradation >= 5) return t
      const nextPool = (t.degradationPool ?? 0) + 0.5
      if (nextPool < 1) {
        return { ...t, degradationPool: nextPool }
      }
      const minLevel = getMinimumLevel(t.level)
      const degradedLevel = Math.max(minLevel, t.level - 1)
      if (degradedLevel !== t.level) {
        degradedEvents.push({
          title: t.title,
          newLevel: degradedLevel,
          hitZero: degradedLevel === 0,
        })
      }
      return {
        ...t,
        level: degradedLevel,
        degradationPool: nextPool - 1,
        totalDegradation: Math.min(5, (t.totalDegradation ?? 0) + 1),
      }
    })
    set({ tasks })
    await persistTasks(tasks)
    // V2 P9 — notif native pour chaque dégradation effective
    for (const { title, newLevel, hitZero } of degradedEvents) {
      void nexus.tasks
        ?.notify(
          hitZero
            ? { type: 'task-hit-zero', taskTitle: title }
            : { type: 'task-degraded', taskTitle: title, newLevel },
        )
        .catch(() => {
          /* silencieux : la notif est complémentaire au state, le store ne doit pas
             refuser la dégradation si le main n'est pas joignable */
        })
    }
  },

  async reconcileLevelZero(todayStr: string) {
    const { updated, events } = reconcileLevelZeroTasks(get().tasks, todayStr)
    // Quick exit si rien à faire
    const changed = events.some(
      (e) =>
        e.type === 'task-forced-three' ||
        e.type === 'task-auto-rescued' ||
        e.type === 'task-accomplished',
    )
    if (!changed) return
    set({ tasks: updated })
    await persistTasks(updated)

    // V2 P9 — notifications natives pour chaque rescue / force / accomplie
    for (const event of events) {
      if (event.type === 'task-forced-three') {
        void nexus.tasks
          ?.notify({ type: 'task-forced-three', taskTitle: event.taskTitle })
          .catch(() => {})
      } else if (event.type === 'task-auto-rescued') {
        void nexus.tasks
          ?.notify({
            type: 'task-auto-rescued',
            taskTitle: event.taskTitle,
            daysLeft: event.daysLeft,
          })
          .catch(() => {})
      }
      // task-accomplished et task-still-zero : pas de notif (transition douce).
    }
  }
}))

function canChangeLevel(lastLevelChangeAt: string | undefined): boolean {
  if (!lastLevelChangeAt) return true
  const diffDays = (Date.now() - new Date(lastLevelChangeAt).getTime()) / 86_400_000
  return diffDays >= 2
}
