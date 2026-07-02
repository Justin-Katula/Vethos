import { create } from 'zustand'
import { vethos } from '@/lib/ipc'
import type { LevelsState, Task, TasksState } from '@shared/schemas'
import {
  calculateCognitiveEfficiencyScore,
  clampManualLevelChange,
  estimateMinutesForLevel,
  getMinimumLevel,
  applyObjectiveProgressToTasks,
  peakAlertnessHour,
  reconcileActiveTasks,
  reconcileObjectiveQueuesOnly,
} from '@/lib/free-time-calculator'
import { assertStorageWrite } from '@/lib/storage-write'
import { useToastStore } from './toast.store'
import { useRegistryStore } from './registry.store'
import { useSettingsStore } from './settings.store'
import { useLevelsStore } from './levels.store'
import { buildCompletionGateResult } from '@/lib/completion-gate-engine'
import { getEngineFlags, withV1FallbackSync } from '@/lib/engine-activation'
import type { CompletionClaim } from '@shared/completion-gate'
import type { PriorityResult } from '@shared/engine-results'
import { samePersistedPriorityScore, toPersistedPriorityScore } from '@/lib/priority-score-migration'
import { useUserModelStore } from './user-model.store'
import { createTaskCompletedEvent, createTaskCreatedEvent } from '@/lib/user-event-collector'
import { buildLearningUpdatesFromSession, gateLearningUpdate } from '@/lib/learning-engine'
import { useDecisionLogStore } from './decision-log.store'
import {
  normalizeStorageUserId,
  resolveStorageUserId,
  storageUserIdFromState,
} from './scoped-storage'

type TasksStore = {
  loaded: boolean
  userId: string | null
  tasks: Task[]

  setUserId: (userId?: string | null) => void
  reset: () => void
  load: (userId?: string) => Promise<void>
  addTask: (title: string, deadline: string, linkedObjectiveId: string | null) => Promise<Task>
  saveTask: (draft: Partial<Task> & { title: string; deadline: string }) => Promise<Task>
  deleteTask: (id: string) => Promise<void>
  markTaskCompleted: (id: string) => Promise<void>
  updateTaskLevel: (id: string, newLevel: number) => Promise<void>
  applySessionDegradation: (completedTaskIds: string[]) => Promise<void>
  applyObjectiveProgress: (deltas: Array<{ objectiveId: string; minutes: number }>) => Promise<void>
  /**
   * Réconcilie les tâches actives selon deadline, remainingMinutes et
   * dégradation automatique toutes les 48h.
   * Appelée au boot et lors des changements de jour. Fire des notifs
   * natives via IPC pour chaque changement.
   */
  reconcileLevelZero: (todayStr: string) => Promise<void>
  persistPriorityScores: (results: PriorityResult[]) => Promise<void>
}

const DEFAULT_TASKS_STATE = {
  loaded: false,
  userId: null,
  tasks: [],
}

function uuid(): string {
  return crypto.randomUUID()
}

function todayKey(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

async function persistTasks(tasks: Task[], userId?: string): Promise<void> {
  try {
    const result = await vethos.storage.write<TasksState>('tasks', { tasks }, userId)
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

async function recordTaskEfficiencySample(
  task: Task,
  actualMinutes: number,
  userId?: string,
): Promise<void> {
  const completedAt = new Date()
  const complexity = task.difficulty ?? task.complexity ?? 'unknown'
  const plannedMinutes = Math.max(1, task.estimatedMinutes ?? estimateMinutesForLevel(task.level))
  const safeActualMinutes = Math.max(1, Math.round(actualMinutes))
  const levels = await vethos.storage.read<LevelsState>('levels', userId)
  const sample = {
    taskId: task.id,
    completedAt: completedAt.toISOString(),
    hour: completedAt.getHours(),
    complexity,
    plannedMinutes,
    actualMinutes: safeActualMinutes,
    efficiency: calculateCognitiveEfficiencyScore({
      taskId: task.id,
      completedAt,
      complexity,
      plannedMinutes,
      actualMinutes: safeActualMinutes,
    }),
  }
  const cognitiveEfficiencySamples = [...(levels?.cognitiveEfficiencySamples ?? []), sample].slice(
    -500,
  )
  const detectedPeakHour = peakAlertnessHour(
    cognitiveEfficiencySamples.map((entry) => ({
      completedAt: entry.completedAt,
      hour: entry.hour,
      efficiency: entry.efficiency,
    })),
    levels?.detectedPeakHour ?? 10,
  )
  await vethos.storage.write<LevelsState>(
    'levels',
    {
      ...(levels?.objectives ? { objectives: levels.objectives } : {}),
      calculatedDailyFreeMinutes: levels?.calculatedDailyFreeMinutes ?? 0,
      calculatedAt: levels?.calculatedAt ?? null,
      lastCalculatedDate: levels?.lastCalculatedDate ?? null,
      lastProcessedSessionId: levels?.lastProcessedSessionId ?? null,
      lastProcessedAppUsageByApp: levels?.lastProcessedAppUsageByApp ?? {},
      closureRitualPromptedAt: levels?.closureRitualPromptedAt ?? null,
      staticPlanDate: levels?.staticPlanDate ?? null,
      staticPlanGeneratedAt: levels?.staticPlanGeneratedAt ?? null,
      passiveSleepSessions: levels?.passiveSleepSessions ?? [],
      cognitiveEfficiencySamples,
      detectedWakeMinute: levels?.detectedWakeMinute,
      detectedSleepMinute: levels?.detectedSleepMinute,
      detectedChronotype: levels?.detectedChronotype,
      detectedPeakHour,
    },
    userId,
  )
}

function normalizeTask(task: Task): Task {
  const estimatedMinutes = task.estimatedMinutes ?? estimateMinutesForLevel(task.level)
  return {
    ...task,
    estimatedMinutes,
    remainingMinutes: task.remainingMinutes ?? estimatedMinutes,
  }
}

export const useTasksStore = create<TasksStore>((set, get) => ({
  ...DEFAULT_TASKS_STATE,

  setUserId(rawUserId) {
    const userId = normalizeStorageUserId(rawUserId) ?? null
    if (get().userId === userId) return
    set({ ...DEFAULT_TASKS_STATE, userId })
  },

  reset() {
    set({ ...DEFAULT_TASKS_STATE })
  },

  async load(rawUserId) {
    const userId = resolveStorageUserId(rawUserId, get())
    if (!userId) {
      get().reset()
      return
    }
    const normalizedUserId = userId ?? null
    if (get().userId !== normalizedUserId) {
      set({ ...DEFAULT_TASKS_STATE, userId: normalizedUserId })
    }

    const stored = await vethos.storage.read<TasksState>('tasks', userId)
    if (stored) {
      const tasks = stored.tasks.map(normalizeTask)
      set({ loaded: true, tasks, userId: normalizedUserId })
      if (
        stored.tasks.some(
          (task) => task.estimatedMinutes === undefined || task.remainingMinutes === undefined,
        )
      ) {
        await persistTasks(tasks, userId)
      }
    } else {
      set({ loaded: true, tasks: [], userId: normalizedUserId })
    }
  },

  async addTask(title, deadline, linkedObjectiveId) {
    const userId = storageUserIdFromState(get())
    const estimatedMinutes = estimateMinutesForLevel(5)
    const newTask: Task = {
      id: uuid(),
      title,
      deadline,
      linkedObjectiveId,
      deadlineImpact: 'recoverable',
      complexity: 'normal',
      estimatedMinutes,
      remainingMinutes: estimatedMinutes,
      level: 5,
      status: 'active',
      createdAt: new Date().toISOString(),
    }
    const queue = reconcileObjectiveQueuesOnly([...get().tasks, newTask], todayKey())
    const newTasks = queue.updated
    set({ tasks: newTasks })
    await persistTasks(newTasks, userId)
    void useUserModelStore.getState().recordEvent(createTaskCreatedEvent(newTask))

    // Trigger AI classification in background
    void useRegistryStore.getState().classifyRegistryForTask(newTask.title, '', newTask.id)

    return newTasks.find((task) => task.id === newTask.id) ?? newTask
  },

  async saveTask(draft) {
    const userId = storageUserIdFromState(get())
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
          deadlineTime: draft.deadlineTime,
          linkedObjectiveId: draft.linkedObjectiveId ?? null,
          deadlineImpact: draft.deadlineImpact ?? 'recoverable',
          complexity: draft.complexity ?? 'normal',
          estimatedMinutes: draft.estimatedMinutes ?? estimateMinutesForLevel(draft.level ?? 5),
          remainingMinutes:
            draft.remainingMinutes ??
            draft.estimatedMinutes ??
            estimateMinutesForLevel(draft.level ?? 5),
          level: draft.level ?? 5,
          blocking: draft.blocking,
          contextNotes: draft.contextNotes,
          subTasks: draft.subTasks,
          coachStatus: draft.coachStatus,
          status: draft.status ?? 'active',
          devForceDate: draft.devForceDate,
          devForceStartMinute: draft.devForceStartMinute,
          devForceEndMinute: draft.devForceEndMinute,
          createdAt: draft.createdAt ?? new Date().toISOString(),
        }
        tasks.push(saved)
      }
    } else {
      const level = draft.level ?? 5
      const estimatedMinutes = estimateMinutesForLevel(level)
      saved = {
        id: uuid(),
        title: draft.title,
        deadline: draft.deadline,
        deadlineTime: draft.deadlineTime,
        linkedObjectiveId: draft.linkedObjectiveId ?? null,
        deadlineImpact: draft.deadlineImpact ?? 'recoverable',
        complexity: draft.complexity ?? 'normal',
        estimatedMinutes,
        remainingMinutes: draft.remainingMinutes ?? estimatedMinutes,
        level,
        blocking: draft.blocking,
        status: 'active',
        devForceDate: draft.devForceDate,
        devForceStartMinute: draft.devForceStartMinute,
        devForceEndMinute: draft.devForceEndMinute,
        createdAt: new Date().toISOString(),
      }
      tasks = [...tasks, saved]
    }
    const previous = get().tasks.find((t) => t.id === draft.id)
    const titleOrNotesChanged =
      !previous ||
      previous.title !== saved!.title ||
      previous.contextNotes !== saved!.contextNotes

    const queue = reconcileObjectiveQueuesOnly(tasks, todayKey())
    set({ tasks: queue.updated })
    await persistTasks(queue.updated, userId)

    if (!previous && saved!) void useUserModelStore.getState().recordEvent(createTaskCreatedEvent(saved!))

    if (titleOrNotesChanged && saved!) {
      void useRegistryStore.getState().classifyRegistryForTask(saved!.title, saved!.contextNotes || '', saved!.id)
    }

    return queue.updated.find((task) => task.id === saved!.id) ?? saved!
  },

  async deleteTask(id) {
    const userId = storageUserIdFromState(get())
    const tasks = get().tasks.filter((t) => t.id !== id)
    set({ tasks })
    await persistTasks(tasks, userId)
  },

  async markTaskCompleted(id) {
    const userId = storageUserIdFromState(get())
    const before = get().tasks.find((task) => task.id === id)
    const completedAt = new Date().toISOString()

    const settings = useSettingsStore.getState()
    const flags = getEngineFlags(settings)

    if (flags.newCompletionGateControlsTaskStatus && before) {
      const objective = before.linkedObjectiveId
        ? useLevelsStore.getState().objectives.find((o) => o.id === before.linkedObjectiveId)
        : null

      const claim: CompletionClaim = {
        userClaimedCompleted: true,
        progressClaim: 'completed',
        summary: "Complété via l'UI",
        claimedAt: completedAt,
      }

      const gateResult = withV1FallbackSync({
        v2: () => {
          return buildCompletionGateResult({
            task: before,
            objective,
            claim,
            settings,
          }) as any
        },
        v1: () => {
          return {
            decision: 'accept_completion' as const,
            reasons: [],
          } as any
        },
        label: 'completion-gate-v2',
      })

      if (gateResult.decision === 'reject_completion') {
        const reason = gateResult.reasons.join(' · ') || "Le moteur de complétion V2 a rejeté cette demande."
        useToastStore.getState().push({
          variant: 'error',
          title: 'Complétion rejetée',
          description: reason,
        })
        throw new Error(reason)
      }
    }

    const completed = get().tasks.map((t) =>
      t.id === id ? { ...t, status: 'completed' as const, remainingMinutes: 0, completedAt } : t,
    )
    const tasks = reconcileObjectiveQueuesOnly(completed, todayKey()).updated
    set({ tasks })
    await persistTasks(tasks, userId)
    const completedTask = tasks.find((task) => task.id === id)
    if (completedTask) void useUserModelStore.getState().recordEvent(createTaskCompletedEvent(completedTask))
    if (before) {
      const planned = before.estimatedMinutes ?? estimateMinutesForLevel(before.level)
      const remaining = before.remainingMinutes ?? planned
      const actualMinutes = Math.max(1, planned - remaining || planned)
      await recordTaskEfficiencySample(before, actualMinutes, userId)
      const objective = before.linkedObjectiveId
        ? useLevelsStore.getState().objectives.find((item) => item.id === before.linkedObjectiveId) ?? null
        : null
      for (const learningUpdate of buildLearningUpdatesFromSession(
        { completedNormally: true, durationMinutes: actualMinutes, plannedMinutes: planned, endedAt: completedAt },
        before,
        objective,
      )) {
        const learningHistory = useDecisionLogStore.getState().entries.flatMap((entry) => entry.learningUpdate ? [entry.learningUpdate] : [])
        const effectiveUpdate = gateLearningUpdate(learningUpdate, learningHistory)
        await useDecisionLogStore.getState().record({
          type: 'learning_signal',
          targetType: effectiveUpdate.targetType,
          targetId: effectiveUpdate.targetId,
          learningUpdate: effectiveUpdate,
        })
        if (effectiveUpdate.taskEstimateAdjustment && effectiveUpdate.targetId === before.id) {
          const factor = 1 + effectiveUpdate.taskEstimateAdjustment / 100
          const adjusted = get().tasks.map((item) => item.id === before.id ? { ...item, estimatedMinutes: Math.max(1, Math.round((item.estimatedMinutes ?? planned) * factor)) } : item)
          set({ tasks: adjusted })
          await persistTasks(adjusted, userId)
        }
        if (effectiveUpdate.objectiveImportanceAdjustment && objective) {
          const current = useUserModelStore.getState().model?.objectivePreferences.find((item) => item.objectiveId === objective.id)?.declaredImportanceScore ?? objective.level * 10
          await useUserModelStore.getState().applyCorrection({
            id: `learning-${completedAt}-${objective.id}`,
            type: 'objective_importance_corrected', targetType: 'objective', targetId: objective.id,
            oldValue: current, newValue: Math.max(0, Math.min(100, current + effectiveUpdate.objectiveImportanceAdjustment)),
            strength: 'weak', createdAt: completedAt,
          })
        }
      }
    }
  },

  async updateTaskLevel(id, desiredLevel) {
    const userId = storageUserIdFromState(get())
    const tasks = get().tasks.map((t) => {
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
    await persistTasks(tasks, userId)
  },

  async applySessionDegradation(completedTaskIds) {
    const userId = storageUserIdFromState(get())
    const degradedEvents: Array<{ title: string; newLevel: number }> = []
    const tasks = get().tasks.map((t) => {
      if (!completedTaskIds.includes(t.id)) return t
      const minLevel = getMinimumLevel(t.level)
      const degradedLevel = Math.max(minLevel, t.level - 1)
      if (degradedLevel !== t.level) {
        degradedEvents.push({
          title: t.title,
          newLevel: degradedLevel,
        })
      }
      return {
        ...t,
        level: degradedLevel,
        lastAutoDegradedAt: new Date().toISOString(),
      }
    })
    set({ tasks })
    await persistTasks(tasks, userId)
    // V2 P9 — notif native pour chaque dégradation effective
    for (const { title, newLevel } of degradedEvents) {
      void vethos.tasks?.notify({ type: 'task-degraded', taskTitle: title, newLevel }).catch(() => {
        /* silencieux : la notif est complémentaire au state, le store ne doit pas
             refuser la dégradation si le main n'est pas joignable */
      })
    }
  },

  async applyObjectiveProgress(deltas) {
    const userId = storageUserIdFromState(get())
    const before = get().tasks
    const { updated } = applyObjectiveProgressToTasks(before, deltas, todayKey())
    set({ tasks: updated })
    await persistTasks(updated, userId)
    for (const previous of before) {
      const next = updated.find((task) => task.id === previous.id)
      if (
        next?.status === 'completed' &&
        previous.status === 'active' &&
        (previous.remainingMinutes ?? 1) > 0
      ) {
        await recordTaskEfficiencySample(
          previous,
          previous.remainingMinutes ?? previous.estimatedMinutes ?? 1,
          userId,
        )
      }
    }
  },

  async reconcileLevelZero(todayStr: string) {
    const userId = storageUserIdFromState(get())
    const { updated, events } = reconcileActiveTasks(get().tasks, todayStr)
    // Quick exit si rien à faire
    const changed = events.length > 0
    if (!changed) return
    set({ tasks: updated })
    await persistTasks(updated, userId)

    // Notifications natives complémentaires ; le state reste la source de vérité.
    for (const event of events) {
      if (event.type === 'task-auto-degraded') {
        void vethos.tasks
          ?.notify({ type: 'task-degraded', taskTitle: event.taskTitle, newLevel: event.newLevel })
          .catch(() => {})
      } else if (event.type === 'task-expired') {
        void vethos.tasks
          ?.notify({ type: 'task-expired', taskTitle: event.taskTitle })
          .catch(() => {})
      }
    }
  },

  async persistPriorityScores(results) {
    const userId = storageUserIdFromState(get())
    const byId = new Map(results.filter((result) => result.kind === 'task').map((result) => [result.targetId, result]))
    let changed = false
    const tasks = get().tasks.map((task) => {
      const result = byId.get(task.id)
      if (!result) return task
      const score = toPersistedPriorityScore(result)
      if (samePersistedPriorityScore(task.priorityScoreV2, score)) return task
      changed = true
      return { ...task, priorityScoreV2: score }
    })
    if (!changed) return
    set({ tasks })
    await persistTasks(tasks, userId)
  },
}))

function canChangeLevel(lastLevelChangeAt: string | undefined): boolean {
  if (!lastLevelChangeAt) return true
  const diffDays = (Date.now() - new Date(lastLevelChangeAt).getTime()) / 86_400_000
  return diffDays >= 2
}
