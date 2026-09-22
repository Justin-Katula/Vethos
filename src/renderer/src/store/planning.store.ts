import { create } from 'zustand'
import { nexus } from '@/lib/ipc'
import { assertStorageWrite } from '@/lib/storage-write'
import { computeAncreMinimum, findAncreConflict } from '@shared/planning/placement'
import { autoSplit, computePlannedDuration, planningFactor } from '@shared/planning/estimation'
import { dateKey, weekKey } from '@shared/planning/dates'
import type { AncreItem, ObjectiveItem, ScheduleEntry, TaskItem } from '@shared/planning/types'
import {
  AncresStateSchema,
  LearningStateSchema,
  ObjectivesStateSchema,
  ScheduleStateSchema,
  SessionConfirmationsStateSchema,
  TasksStateSchema,
  type LearningState,
  type SessionConfirmationsState,
} from '@shared/schemas'
import {
  allouerCouleurAncre,
  allouerCouleurObjectif,
  allouerCouleurTache,
  assainirCouleur,
  estCouleurDansFamille,
} from '@shared/palettes'

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
  consecutiveDelays: {},
  workedMinutesByRef: {},
  dailyDelayMinutes: {},
}

/**
 * B.5.2 : le pas de « il m'en faut plus ». Un seul chiffre, pas un champ à
 * remplir — la question posée est « ça ne suffisait pas », pas « combien
 * exactement », à quoi l'utilisateur ne saurait pas mieux répondre qu'à sa
 * première estimation (B.1). Aligné sur le bloc minimum utile (D.5) : accorder
 * moins ne produirait aucun créneau plaçable.
 */
export const MORE_TIME_STEP_MINUTES = 25

type PlanningStore = {
  loaded: boolean
  tasks: TaskItem[]
  objectives: ObjectiveItem[]
  ancres: AncreItem[]
  schedule: ScheduleEntry[]
  learning: LearningState
  /**
   * D.7/D.8 : bookkeeping du jour courant écrit par l'horloge de planification
   * (processus main) — `null` tant que rien n'a encore tourné aujourd'hui.
   * Permet de savoir, bloc par bloc, si « Je commence » a vraiment eu lieu.
   */
  sessionConfirmations: SessionConfirmationsState | null

  load: () => Promise<void>

  /**
   * `maxPerDayMinutes` est le plafond réel d'un jour (40 % de la capacité
   * effective). Au-delà, la tâche est découpée automatiquement (B.5).
   */
  addTask: (t: TaskDraft, options?: { maxPerDayMinutes?: number }) => Promise<void>
  updateTaskRemaining: (id: string, minutes: number) => Promise<void>
  /**
   * B.5.2 : « il m'en faut plus ». La SEULE prise que l'utilisateur garde sur
   * la fin d'une tâche — il ne la déclare plus terminée (c'est l'horloge de
   * planification qui le décide, quand le temps prévu a réellement été fait),
   * il peut seulement dire que le temps prévu ne suffisait pas.
   *
   * Les minutes s'ajoutent à `extraMinutes`, jamais à `estimatedMinutes` :
   * gonfler l'estimation d'origine effacerait la seule trace exploitable par
   * le facteur de correction (B.2), qui compare réel ÷ estimé.
   */
  addMoreTime: (id: string, minutes: number) => Promise<void>
  deleteTask: (id: string) => Promise<void>

  addObjective: (o: Creatable<ObjectiveItem, 'id' | 'createdAt'>) => Promise<void>
  deleteObjective: (id: string) => Promise<void>

  /** Refuse la création en cas de conflit d'heure ou de déclencheur (D.3). */
  addAncre: (a: Creatable<AncreItem, 'id' | 'createdAt' | 'minimumMinutes'>) => Promise<void>
  deleteAncre: (id: string) => Promise<void>

  setSchedule: (entries: ScheduleEntry[]) => Promise<void>
}

/**
 * Ce que l'appelant fournit vraiment à la création : les champs générés par le
 * store sont retirés, et `appsToBlock` (D.8) reste facultatif — le schéma le
 * remplit à `[]`. Un bloc sans application déclarée suspend quand même
 * l'horaire fixe le temps de sa session ; il ne bloque simplement rien de plus.
 */
export type Creatable<T, GeneratedKeys extends keyof T> = Omit<T, GeneratedKeys | 'appsToBlock'> & {
  appsToBlock?: string[]
}

/**
 * Ce que l'interface fournit vraiment pour créer une tâche. `partOrder` et
 * `extraMinutes` en sont exclus À DESSEIN : le rang d'une partie est décidé par
 * le découpage (B.5.1) et le temps supplémentaire par `addMoreTime` (B.5.2) —
 * jamais choisis à la création.
 */
export type TaskDraft = Creatable<
  TaskItem,
  'id' | 'createdAt' | 'parentTaskId' | 'partOrder' | 'extraMinutes'
>

export const usePlanningStore = create<PlanningStore>((set, get) => ({
  loaded: false,
  tasks: [],
  objectives: [],
  ancres: [],
  schedule: [],
  learning: EMPTY_LEARNING,
  sessionConfirmations: null,

  async load() {
    const [tasks, objectives, ancres, schedule, learning, sessionConfirmations] = await Promise.all(
      [
        nexus.storage.read('tasks'),
        nexus.storage.read('objectives'),
        nexus.storage.read('ancres'),
        nexus.storage.read('schedule'),
        nexus.storage.read('learning'),
        nexus.storage.read('session_confirmations'),
      ],
    )

    const rawTasks = TasksStateSchema.safeParse(tasks).data?.tasks ?? []
    const rawObjectives = ObjectivesStateSchema.safeParse(objectives).data?.objectives ?? []
    const rawAncres = AncresStateSchema.safeParse(ancres).data?.ancres ?? []

    const cleanTasks = rawTasks.map((t, i) => ({
      ...t,
      color: assainirCouleur('task', t.color, i),
    }))
    const cleanObjectives = rawObjectives.map((o, i) => ({
      ...o,
      color: assainirCouleur('objective', o.color, i),
    }))
    const cleanAncres = rawAncres.map((a, i) => ({
      ...a,
      color: assainirCouleur('ancre', a.color, i),
    }))

    set({
      loaded: true,
      tasks: cleanTasks,
      objectives: cleanObjectives,
      ancres: cleanAncres,
      schedule: ScheduleStateSchema.safeParse(schedule).data?.entries ?? [],
      learning: LearningStateSchema.safeParse(learning).data ?? EMPTY_LEARNING,
      sessionConfirmations:
        SessionConfirmationsStateSchema.safeParse(sessionConfirmations).data ?? null,
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

    const activeTasks = get().tasks.filter((t) => t.status === 'active')
    const color =
      input.color && estCouleurDansFamille('task', input.color)
        ? input.color
        : allouerCouleurTache(activeTasks)

    const task: TaskItem = {
      ...input,
      color,
      appsToBlock: input.appsToBlock ?? [],
      correctionFactor: factor.factor,
      remainingMinutes: planned,
      id,
      parentTaskId: null,
      partOrder: null,
      extraMinutes: 0,
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
              // B.5.1 : `autoSplit` produisait déjà ce rang — il était jeté ici,
              // et sans lui les parties partageaient leurs QUATRE clés de tri
              // (`createdAt` compris, calculé une seule fois ci-dessus pour
              // tout le lot). Le comparateur renvoyait 0 partout et l'ordre
              // final était arbitraire : défaut réel observé le 2026-08-23,
              // les parties sortaient dans l'ordre 1, 4, 2, 5, 3.
              partOrder: part.order,
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

  async addMoreTime(id, minutes) {
    const extra = Math.max(0, Math.round(minutes))
    if (extra === 0) return

    // B.5.2 : la tâche redevient active si l'horloge venait de la terminer —
    // c'est précisément le cas que ce bouton existe pour rattraper : le temps
    // prévu était fait, mais le travail ne l'était pas.
    const tasks = get().tasks.map((t) =>
      t.id === id ? { ...t, extraMinutes: t.extraMinutes + extra, status: 'active' as const } : t,
    )
    set({ tasks })
    assertStorageWrite(await nexus.storage.write('tasks', { tasks }), 'tasks')
  },

  async deleteTask(id) {
    const tasks = get().tasks.filter((t) => t.id !== id && t.parentTaskId !== id)
    set({ tasks })
    assertStorageWrite(await nexus.storage.write('tasks', { tasks }), 'tasks')
  },

  async addObjective(input) {
    const color =
      input.color && estCouleurDansFamille('objective', input.color)
        ? input.color
        : allouerCouleurObjectif(get().objectives)

    const objective: ObjectiveItem = {
      ...input,
      color,
      appsToBlock: input.appsToBlock ?? [],
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
          ? `“${conflict.name}” already uses the trigger “${conflict.trigger}”.`
          : `Time clash with “${conflict.name}”. Pick another hour.`,
      )
    }

    const color =
      input.color && estCouleurDansFamille('ancre', input.color)
        ? input.color
        : allouerCouleurAncre(get().ancres)

    const ancre: AncreItem = {
      ...input,
      color,
      appsToBlock: input.appsToBlock ?? [],
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
