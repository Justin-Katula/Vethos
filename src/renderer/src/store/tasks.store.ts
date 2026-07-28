import { create } from 'zustand'
import { nexus } from '@/lib/ipc'
import type { Task, TasksState } from '@shared/schemas'
import { assertStorageWrite } from '@/lib/storage-write'
import { useToastStore } from './toast.store'

type TasksStore = {
  loaded: boolean
  tasks: Task[]

  load: () => Promise<void>
  addTask: (title: string, deadline: string, linkedObjectiveId: string | null) => Promise<Task>
  saveTask: (draft: Partial<Task> & { title: string; deadline: string }) => Promise<Task>
  deleteTask: (id: string) => Promise<void>
  markTaskCompleted: (id: string) => Promise<void>
}

function uuid(): string {
  return crypto.randomUUID()
}

async function persistTasks(tasks: Task[]): Promise<void> {
  try {
    const result = await nexus.storage.write<TasksState>('tasks', { tasks })
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
      importance: 5,
      category: undefined,
      estimatedMinutes: 60,
      remainingMinutes: 60,
      correctionFactor: 1.4,
      status: 'active',
      createdAt: new Date().toISOString(),
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
      tasks = tasks.map((t) => {
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
          importance: draft.importance ?? 5,
          category: draft.category,
          estimatedMinutes: draft.estimatedMinutes ?? 60,
          remainingMinutes: draft.remainingMinutes ?? 60,
          correctionFactor: draft.correctionFactor ?? 1.4,
          status: draft.status ?? 'active',
          createdAt: draft.createdAt ?? new Date().toISOString(),
        }
        tasks.push(saved)
      }
    } else {
      saved = {
        id: uuid(),
        title: draft.title,
        deadline: draft.deadline,
        linkedObjectiveId: draft.linkedObjectiveId ?? null,
        importance: draft.importance ?? 5,
        category: draft.category,
        estimatedMinutes: draft.estimatedMinutes ?? 60,
        remainingMinutes: draft.remainingMinutes ?? 60,
        correctionFactor: draft.correctionFactor ?? 1.4,
        status: 'active',
        createdAt: new Date().toISOString(),
      }
      tasks = [...tasks, saved]
    }
    set({ tasks })
    await persistTasks(tasks)
    return saved!
  },

  async deleteTask(id) {
    const tasks = get().tasks.filter((t) => t.id !== id)
    set({ tasks })
    await persistTasks(tasks)
  },

  async markTaskCompleted(id) {
    const tasks = get().tasks.map((t) => (t.id === id ? { ...t, status: 'history' as const } : t))
    set({ tasks })
    await persistTasks(tasks)
  },
}))
