import { create } from 'zustand'
import { nexus } from '@/lib/ipc'
import type { TaskItem, ObjectiveItem, AncreItem, ScheduleEntry } from '@/lib/planning/types'
import { assertStorageWrite } from '@/lib/storage-write'
import { computeAncreMinimum } from '@/lib/planning/placement'

// ─── Schemas pour le stockage ─────────────────────────────────────────────
import { z } from 'zod'

const TaskSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(100),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  importance: z.number().int().min(1).max(10).default(5),
  category: z.string().max(60).default('général'),
  estimatedMinutes: z.number().int().min(1).max(1440).default(60),
  remainingMinutes: z.number().int().min(0).default(60),
  correctionFactor: z.number().min(0.5).max(3).default(1.4),
  status: z.enum(['active', 'history']).default('active'),
  createdAt: z.string().datetime(),
})

const ObjectiveSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(60),
  description: z.string().max(500).optional(),
  color: z.string(),
  weeklyTargetMinutes: z.number().int().min(0).max(6000).default(300),
  createdAt: z.string().datetime(),
})

const AncreSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(60),
  color: z.string(),
  trigger: z.string().min(1).max(80),
  anchorMinute: z.number().int().min(0).max(1439),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1),
  normalMaxMinutes: z.number().int().min(15).max(480).default(60),
  minimumMinutes: z.number().int().min(20).max(480).default(24),
  createdAt: z.string().datetime(),
})

const ScheduleEntrySchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startMinute: z.number().int().min(0).max(1440),
  endMinute: z.number().int().min(0).max(1440),
  categoryType: z.enum(['sleep', 'school', 'work', 'commitment', 'free', 'custom']),
  label: z.string(),
  color: z.string(),
})

const TasksState = z.object({ tasks: z.array(TaskSchema) })
const ObjectivesState = z.object({ objectives: z.array(ObjectiveSchema) })
const AncresState = z.object({ ancres: z.array(AncreSchema) })
const ScheduleState = z.object({ entries: z.array(ScheduleEntrySchema) })

type PlanningStore = {
  loaded: boolean
  tasks: TaskItem[]
  objectives: ObjectiveItem[]
  ancres: AncreItem[]
  schedule: ScheduleEntry[]

  load: () => Promise<void>
  addTask: (t: Omit<TaskItem, 'id' | 'createdAt' | 'correctionFactor'>) => Promise<void>
  updateTaskRemaining: (id: string, minutes: number) => Promise<void>
  completeTask: (id: string) => Promise<void>
  deleteTask: (id: string) => Promise<void>
  addObjective: (o: Omit<ObjectiveItem, 'id' | 'createdAt'>) => Promise<void>
  deleteObjective: (id: string) => Promise<void>
  addAncre: (a: Omit<AncreItem, 'id' | 'createdAt' | 'minimumMinutes'>) => Promise<void>
  deleteAncre: (id: string) => Promise<void>
  setSchedule: (entries: ScheduleEntry[]) => Promise<void>
}

function localDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const usePlanningStore = create<PlanningStore>((set, get) => ({
  loaded: false,
  tasks: [],
  objectives: [],
  ancres: [],
  schedule: [],

  async load() {
    const [ts, os, as, ss] = await Promise.all([
      nexus.storage.read<z.infer<typeof TasksState>>('tasks'),
      nexus.storage.read<z.infer<typeof ObjectivesState>>('objectives'),
      nexus.storage.read<z.infer<typeof AncresState>>('ancres'),
      nexus.storage.read<z.infer<typeof ScheduleState>>('schedule'),
    ])
    set({
      loaded: true,
      tasks: (ts?.tasks ?? []) as TaskItem[],
      objectives: (os?.objectives ?? []) as ObjectiveItem[],
      ancres: (as?.ancres ?? []) as AncreItem[],
      schedule: (ss?.entries ?? []) as ScheduleEntry[],
    })
  },

  async addTask(t) {
    const task: TaskItem = { ...t, id: crypto.randomUUID(), correctionFactor: 1.4, createdAt: new Date().toISOString() }
    const tasks = [...get().tasks, task]
    set({ tasks })
    const result = await nexus.storage.write('tasks', { tasks })
    assertStorageWrite(result, 'tasks')
  },

  async updateTaskRemaining(id, minutes) {
    const tasks = get().tasks.map((t) => t.id === id ? { ...t, remainingMinutes: Math.max(0, minutes) } : t)
    set({ tasks })
    const result = await nexus.storage.write('tasks', { tasks })
    assertStorageWrite(result, 'tasks')
  },

  async completeTask(id) {
    const tasks = get().tasks.map((t) => t.id === id ? { ...t, status: 'history' as const, remainingMinutes: 0 } : t)
    set({ tasks })
    const result = await nexus.storage.write('tasks', { tasks })
    assertStorageWrite(result, 'tasks')
  },

  async deleteTask(id) {
    const tasks = get().tasks.filter((t) => t.id !== id)
    set({ tasks })
    const result = await nexus.storage.write('tasks', { tasks })
    assertStorageWrite(result, 'tasks')
  },

  async addObjective(o) {
    const objective: ObjectiveItem = { ...o, id: crypto.randomUUID(), createdAt: new Date().toISOString() }
    const objectives = [...get().objectives, objective]
    set({ objectives })
    const result = await nexus.storage.write('objectives', { objectives })
    assertStorageWrite(result, 'objectives')
  },

  async deleteObjective(id) {
    const objectives = get().objectives.filter((o) => o.id !== id)
    set({ objectives })
    const result = await nexus.storage.write('objectives', { objectives })
    assertStorageWrite(result, 'objectives')
  },

  async addAncre(a) {
    // D.3 : deux ancres ne peuvent pas occuper le même créneau (critère 6).
    for (const existing of get().ancres) {
      for (const day of a.daysOfWeek) {
        if (existing.daysOfWeek.includes(day) && existing.anchorMinute === a.anchorMinute) {
          throw new Error(`Conflit avec "${existing.name}" — même heure, même jour.`)
        }
      }
    }
    const ancre: AncreItem = { ...a, id: crypto.randomUUID(), minimumMinutes: computeAncreMinimum(a.normalMaxMinutes), createdAt: new Date().toISOString() }
    const ancres = [...get().ancres, ancre]
    set({ ancres })
    const result = await nexus.storage.write('ancres', { ancres })
    assertStorageWrite(result, 'ancres')
  },

  async deleteAncre(id) {
    const ancres = get().ancres.filter((a) => a.id !== id)
    set({ ancres })
    const result = await nexus.storage.write('ancres', { ancres })
    assertStorageWrite(result, 'ancres')
  },

  async setSchedule(entries) {
    set({ schedule: entries })
    const result = await nexus.storage.write('schedule', { entries })
    assertStorageWrite(result, 'schedule')
  },
}))

export { localDateKey }
