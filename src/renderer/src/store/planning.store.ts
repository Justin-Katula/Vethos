import { create } from 'zustand'
import { nexus } from '@/lib/ipc'
import { assertStorageWrite } from '@/lib/storage-write'
import { computeAncreMinimum, findAncreConflict } from '@/lib/planning/placement'
import { autoSplit, computePlannedDuration, planningFactor } from '@/lib/planning/estimation'
import { dateKey, weekKey } from '@/lib/planning/dates'
import type { AncreItem, ObjectiveItem, ScheduleEntry, TaskItem } from '@/lib/planning/types'
import {
  AncresStateSchema,
  LearningStateSchema,
  ObjectivesStateSchema,
  ScheduleStateSchema,
  TasksStateSchema,
  type LearningState,
} from '@shared/schemas'

/**
 * Store unique du planning : réalité fixe, objectifs, ancres, tâches, mesures.
 *
 * Tout ce qui sort du disque est validé par les schémas partagés — la même
 * forme que celle qui y entre. Une donnée invalide n'est jamais castée en
 * silence : elle est remplacée par un état vide et signalée.
 */

const EMPTY_LEARNING: LearningState = {
  observations: [],
  anchorMissCounts: {},
  dailyUtilization: {},
  weeklyObjectiveServed: {},
  objectiveLastServed: {},
  lastSignalAt: {},
  tasksCreatedPerWeek: {},
}

type PlanningStore = {
  loaded: boolean
  tasks: TaskItem[]
  objectives: ObjectiveItem[]
  ancres: AncreItem[]
  schedule: ScheduleEntry[]
  learning: LearningState

  load: () => Promise<void>

  /**
   * `maxPerDayMinutes` est le plafond réel d'un jour (40 % de la capacité
   * effective). Au-delà, la tâche est découpée automatiquement (B.5).
   */
  addTask: (
    t: Omit<TaskItem, 'id' | 'createdAt' | 'parentTaskId'>,
    options?: { maxPerDayMinutes?: number },
  ) => Promise<void>
  updateTaskRemaining: (id: string, minutes: number) => Promise<void>
  completeTask: (id: string, measuredMinutes?: number) => Promise<void>
  deleteTask: (id: string) => Promise<void>

  addObjective: (o: Omit<ObjectiveItem, 'id' | 'createdAt'>) => Promise<void>
  deleteObjective: (id: string) => Promise<void>

  /** Refuse la création en cas de conflit d'heure ou de déclencheur (D.3). */
  addAncre: (a: Omit<AncreItem, 'id' | 'createdAt' | 'minimumMinutes'>) => Promise<void>
  deleteAncre: (id: string) => Promise<void>

  setSchedule: (entries: ScheduleEntry[]) => Promise<void>
}

export const usePlanningStore = create<PlanningStore>((set, get) => ({
  loaded: false,
  tasks: [],
  objectives: [],
  ancres: [],
  schedule: [],
  learning: EMPTY_LEARNING,

  async load() {
    const [tasks, objectives, ancres, schedule, learning] = await Promise.all([
      nexus.storage.read('tasks'),
      nexus.storage.read('objectives'),
      nexus.storage.read('ancres'),
      nexus.storage.read('schedule'),
      nexus.storage.read('learning'),
    ])

    set({
      loaded: true,
      tasks: TasksStateSchema.safeParse(tasks).data?.tasks ?? [],
      objectives: ObjectivesStateSchema.safeParse(objectives).data?.objectives ?? [],
      ancres: AncresStateSchema.safeParse(ancres).data?.ancres ?? [],
      schedule: ScheduleStateSchema.safeParse(schedule).data?.entries ?? [],
      learning: LearningStateSchema.safeParse(learning).data ?? EMPTY_LEARNING,
    })
  },

  async addTask(input, options) {
    // B.1/B.4 : la durée retenue est l'estimation CORRIGÉE par ce que les
    // tâches passées de cette catégorie ont réellement coûté. L'utilisateur
    // donne son estimation ; l'application ne la prend jamais au mot.
    const factor = planningFactor({
      observations: get().learning.observations,
      category: input.category,
      workKind: input.workKind,
      hasDeadline: true,
    })
    const planned = computePlannedDuration(input.estimatedMinutes, factor.factor)
    const createdAt = new Date().toISOString()
    const id = crypto.randomUUID()

    const task: TaskItem = {
      ...input,
      correctionFactor: factor.factor,
      remainingMinutes: planned,
      id,
      parentTaskId: null,
      createdAt,
    }

    // B.5 : si la durée corrigée ne tient pas dans un jour sans violer le
    // plafond de D.5, le découpage est appliqué directement — jamais une
    // question posée.
    const parts = options?.maxPerDayMinutes
      ? autoSplit({ totalMinutes: planned, maxPerDayMinutes: options.maxPerDayMinutes })
      : []

    const created: TaskItem[] =
      parts.length > 0
        ? [
            // La tâche d'origine devient un regroupement visuel.
            { ...task, remainingMinutes: 0 },
            ...parts.map((part) => ({
              ...task,
              id: crypto.randomUUID(),
              parentTaskId: id,
              title: `${task.title} — ${part.label}`,
              estimatedMinutes: part.minutes,
              remainingMinutes: part.minutes,
            })),
          ]
        : [task]

    const tasks = [...get().tasks, ...created]

    // D.6 : λ se mesure, il ne se déclare pas.
    const week = weekKey(dateKey(new Date()))
    const learning: LearningState = {
      ...get().learning,
      tasksCreatedPerWeek: {
        ...get().learning.tasksCreatedPerWeek,
        [week]: (get().learning.tasksCreatedPerWeek[week] ?? 0) + 1,
      },
    }

    set({ tasks, learning })
    assertStorageWrite(await nexus.storage.write('tasks', { tasks }), 'tasks')
    assertStorageWrite(await nexus.storage.write('learning', learning), 'learning')
  },

  async updateTaskRemaining(id, minutes) {
    const tasks = get().tasks.map((t) =>
      t.id === id ? { ...t, remainingMinutes: Math.max(0, Math.round(minutes)) } : t,
    )
    set({ tasks })
    assertStorageWrite(await nexus.storage.write('tasks', { tasks }), 'tasks')
  },

  async completeTask(id, measuredMinutes) {
    const task = get().tasks.find((t) => t.id === id)
    const tasks = get().tasks.map((t) =>
      t.id === id ? { ...t, status: 'history' as const, remainingMinutes: 0 } : t,
    )

    // G.1 : on n'enregistre une observation que s'il y a une MESURE.
    // Sans temps de session mesuré, rien n'est appris — on n'invente pas.
    const learning: LearningState =
      task && typeof measuredMinutes === 'number' && measuredMinutes > 0
        ? {
            ...get().learning,
            observations: [
              ...get().learning.observations,
              {
                taskId: task.id,
                category: task.category,
                workKind: task.workKind,
                estimatedMinutes: task.estimatedMinutes,
                actualMinutes: Math.round(measuredMinutes),
                completed: true,
                createdAt: new Date().toISOString(),
              },
            ],
          }
        : get().learning

    set({ tasks, learning })
    assertStorageWrite(await nexus.storage.write('tasks', { tasks }), 'tasks')
    assertStorageWrite(await nexus.storage.write('learning', learning), 'learning')
  },

  async deleteTask(id) {
    const tasks = get().tasks.filter((t) => t.id !== id && t.parentTaskId !== id)
    set({ tasks })
    assertStorageWrite(await nexus.storage.write('tasks', { tasks }), 'tasks')
  },

  async addObjective(input) {
    const objective: ObjectiveItem = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    }
    const objectives = [...get().objectives, objective]
    set({ objectives })
    assertStorageWrite(await nexus.storage.write('objectives', { objectives }), 'objectives')
  },

  async deleteObjective(id) {
    const objectives = get().objectives.filter((o) => o.id !== id)
    set({ objectives })
    assertStorageWrite(await nexus.storage.write('objectives', { objectives }), 'objectives')
  },

  async addAncre(input) {
    // D.3 : conflit d'heure ou de déclencheur → création REFUSÉE, sans
    // exception. Pas de fusion, pas de décalage automatique : c'est à
    // l'utilisateur de changer l'heure.
    const conflict = findAncreConflict(input, get().ancres)
    if (conflict) {
      throw new Error(
        conflict.trigger.trim().toLowerCase() === input.trigger.trim().toLowerCase()
          ? `« ${conflict.name} » utilise déjà le déclencheur « ${conflict.trigger} ».`
          : `Conflit d'horaire avec « ${conflict.name} ». Choisis une autre heure.`,
      )
    }

    const ancre: AncreItem = {
      ...input,
      id: crypto.randomUUID(),
      minimumMinutes: computeAncreMinimum(input.normalMaxMinutes),
      createdAt: new Date().toISOString(),
    }
    const ancres = [...get().ancres, ancre]
    set({ ancres })
    assertStorageWrite(await nexus.storage.write('ancres', { ancres }), 'ancres')
  },

  async deleteAncre(id) {
    const ancres = get().ancres.filter((a) => a.id !== id)
    set({ ancres })
    assertStorageWrite(await nexus.storage.write('ancres', { ancres }), 'ancres')
  },

  async setSchedule(entries) {
    set({ schedule: entries })
    assertStorageWrite(await nexus.storage.write('schedule', { entries }), 'schedule')
  },
}))
