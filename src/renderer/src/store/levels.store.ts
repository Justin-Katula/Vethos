import { create } from 'zustand'
import { vethos } from '@/lib/ipc'
import type {
  BlockingHistoryEntry,
  LevelsState,
  Objective,
  ObjectivesState,
  TimeRule,
} from '@shared/schemas'
import { DEFAULT_OBJECTIVE_LEVEL, clampObjectiveLevel } from '@shared/schemas'
import { assertStorageWrite } from '@/lib/storage-write'
import { useToastStore } from './toast.store'
import { useTasksStore } from './tasks.store'
import { useRegistryStore } from './registry.store'
import {
  normalizeStorageUserId,
  resolveStorageUserId,
  storageUserIdFromState,
} from './scoped-storage'
import { useUserModelStore } from './user-model.store'
import { createObjectiveSelectedEvent } from '@/lib/user-event-collector'
import type { PriorityResult } from '@shared/engine-results'
import { samePersistedPriorityScore, toPersistedPriorityScore } from '@/lib/priority-score-migration'

type SaveObjectiveDraft = {
  id?: string
  name: string
  description?: string
  color: string
  icon?: string
  linkedRuleIds?: string[]
  level?: number
  status?: Objective['status']
  protectedCommitments?: string[]
  blocking?: Objective['blocking']
}

export type ProgressEvent = {
  at: string
  objectiveDeltas: Array<{ objectiveId: string; minutes: number }>
}

type LevelsStore = {
  userId: string | null
  loaded: boolean
  objectives: Objective[]
  calculatedDailyFreeMinutes: number
  calculatedAt: string | null
  lastCalculatedDate: string | null
  lastProcessedSessionId: string | null
  closureRitualPromptedAt: string | null
  staticPlanDate: string | null
  staticPlanGeneratedAt: string | null
  passiveSleepSessions: NonNullable<LevelsState['passiveSleepSessions']>
  cognitiveEfficiencySamples: NonNullable<LevelsState['cognitiveEfficiencySamples']>
  detectedPeakHour: number | null
  detectedWakeMinute: number | null
  detectedSleepMinute: number | null
  detectedChronotype: LevelsState['detectedChronotype'] | null
  lastProgressEvent: ProgressEvent | null

  setUserId: (userId?: string | null) => void
  reset: () => void
  load: (userId?: string) => Promise<void>
  saveObjective: (draft: SaveObjectiveDraft) => Promise<Objective>
  deleteObjective: (id: string) => Promise<void>
  changeObjectiveLevel: (id: string, newLevel: number) => Promise<{ ok: boolean; reason?: string }>
  setCalculatedFreeTime: (minutes: number, date: string) => Promise<void>
  reconcileWithHistory: (history: BlockingHistoryEntry[], rules: TimeRule[]) => Promise<void>
  consumeProgressEvent: () => void
  persistPriorityScores: (results: PriorityResult[]) => Promise<void>
}

const DEFAULT_LEVELS_STATE = {
  userId: null,
  loaded: false,
  objectives: [],
  calculatedDailyFreeMinutes: 0,
  calculatedAt: null,
  lastCalculatedDate: null,
  lastProcessedSessionId: null,
  closureRitualPromptedAt: null,
  staticPlanDate: null,
  staticPlanGeneratedAt: null,
  passiveSleepSessions: [],
  cognitiveEfficiencySamples: [],
  detectedPeakHour: null,
  detectedWakeMinute: null,
  detectedSleepMinute: null,
  detectedChronotype: null,
  lastProgressEvent: null,
}

function uuid(): string {
  return crypto.randomUUID()
}

function buildLevelsPayload(state: LevelsStore): LevelsState {
  return {
    calculatedDailyFreeMinutes: state.calculatedDailyFreeMinutes,
    calculatedAt: state.calculatedAt,
    lastCalculatedDate: state.lastCalculatedDate,
    lastProcessedSessionId: state.lastProcessedSessionId,
    lastProcessedAppUsageByApp: {},
    closureRitualPromptedAt: state.closureRitualPromptedAt,
    staticPlanDate: state.staticPlanDate,
    staticPlanGeneratedAt: state.staticPlanGeneratedAt,
    passiveSleepSessions: state.passiveSleepSessions,
    cognitiveEfficiencySamples: state.cognitiveEfficiencySamples,
    detectedPeakHour: state.detectedPeakHour ?? undefined,
    detectedWakeMinute: state.detectedWakeMinute ?? undefined,
    detectedSleepMinute: state.detectedSleepMinute ?? undefined,
    detectedChronotype: state.detectedChronotype ?? undefined,
  }
}

async function persistObjectives(objectives: Objective[], userId?: string): Promise<void> {
  if (!userId) return
  try {
    const result = await vethos.storage.write<ObjectivesState>('objectives', { objectives }, userId)
    assertStorageWrite(result, 'objectives')
  } catch (err) {
    useToastStore.getState().push({
      variant: 'error',
      title: 'Sauvegarde objectifs échouée',
      description: err instanceof Error ? err.message : String(err),
    })
    throw err
  }
}

async function persistLevels(state: LevelsStore, userId?: string): Promise<void> {
  if (!userId) return
  try {
    const result = await vethos.storage.write<LevelsState>(
      'levels',
      buildLevelsPayload(state),
      userId,
    )
    assertStorageWrite(result, 'levels')
  } catch (err) {
    useToastStore.getState().push({
      variant: 'error',
      title: 'Sauvegarde niveaux échouée',
      description: err instanceof Error ? err.message : String(err),
    })
    throw err
  }
}

function durationMinutes(entry: BlockingHistoryEntry): number {
  const start = new Date(entry.startedAt).getTime()
  const end = new Date(entry.endedAt).getTime()
  return Math.max(0, Math.round((end - start) / 60_000))
}

export const useLevelsStore = create<LevelsStore>((set, get) => ({
  ...DEFAULT_LEVELS_STATE,

  setUserId(rawUserId) {
    const userId = normalizeStorageUserId(rawUserId) ?? null
    if (get().userId === userId) return
    set({ ...DEFAULT_LEVELS_STATE, userId })
  },

  reset() {
    set({ ...DEFAULT_LEVELS_STATE })
  },

  async load(rawUserId) {
    const userId = resolveStorageUserId(rawUserId, get())
    if (!userId) {
      get().reset()
      return
    }
    if (get().userId !== userId) {
      set({ ...DEFAULT_LEVELS_STATE, userId })
    }

    const [objectiveState, levels] = await Promise.all([
      vethos.storage.read<ObjectivesState>('objectives', userId),
      vethos.storage.read<LevelsState>('levels', userId),
    ])

    const migratedObjectives = objectiveState?.objectives ?? levels?.objectives ?? []

    set({
      userId,
      loaded: true,
      objectives: migratedObjectives,
      calculatedDailyFreeMinutes: levels?.calculatedDailyFreeMinutes ?? 0,
      calculatedAt: levels?.calculatedAt ?? null,
      lastCalculatedDate: levels?.lastCalculatedDate ?? null,
      lastProcessedSessionId: levels?.lastProcessedSessionId ?? null,
      closureRitualPromptedAt: levels?.closureRitualPromptedAt ?? null,
      staticPlanDate: levels?.staticPlanDate ?? null,
      staticPlanGeneratedAt: levels?.staticPlanGeneratedAt ?? null,
      passiveSleepSessions: levels?.passiveSleepSessions ?? [],
      cognitiveEfficiencySamples: levels?.cognitiveEfficiencySamples ?? [],
      detectedPeakHour: levels?.detectedPeakHour ?? null,
      detectedWakeMinute: levels?.detectedWakeMinute ?? null,
      detectedSleepMinute: levels?.detectedSleepMinute ?? null,
      detectedChronotype: levels?.detectedChronotype ?? null,
    })

    if (!objectiveState && migratedObjectives.length > 0) {
      await persistObjectives(migratedObjectives, userId)
    }
    await persistLevels(get(), userId)
  },

  async saveObjective(draft) {
    const userId = storageUserIdFromState(get())
    const now = new Date().toISOString()
    const objectives = get().objectives.slice()
    let saved: Objective
    if (draft.id) {
      const i = objectives.findIndex((o) => o.id === draft.id)
      if (i < 0) throw new Error(`Objectif introuvable : ${draft.id}`)
      saved = {
        ...objectives[i]!,
        name: draft.name,
        description: draft.description,
        color: draft.color,
        icon: draft.icon,
        status: draft.status ?? objectives[i]!.status,
        protectedCommitments: draft.protectedCommitments ?? objectives[i]!.protectedCommitments,
        blocking: draft.blocking ?? objectives[i]!.blocking,
        linkedRuleIds: draft.linkedRuleIds ?? objectives[i]!.linkedRuleIds,
        level: draft.level === undefined ? objectives[i]!.level : clampObjectiveLevel(draft.level),
      }
      objectives[i] = saved
    } else {
      saved = {
        id: uuid(),
        name: draft.name,
        description: draft.description,
        color: draft.color,
        icon: draft.icon,
        linkedRuleIds: draft.linkedRuleIds ?? [],
        level:
          draft.level === undefined ? DEFAULT_OBJECTIVE_LEVEL : clampObjectiveLevel(draft.level),
        status: draft.status ?? 'active',
        protectedCommitments: draft.protectedCommitments,
        blocking: draft.blocking,
        createdAt: now,
      }
      objectives.push(saved)
    }
    const previous = get().objectives.find((o) => o.id === draft.id)
    const infoChanged =
      !previous ||
      previous.name !== saved.name ||
      previous.description !== saved.description

    set({ objectives })
    await persistObjectives(objectives, userId)
    void useUserModelStore.getState().recordEvent(createObjectiveSelectedEvent(saved))

    if (infoChanged) {
      void useRegistryStore.getState().classifyRegistryForObjective(saved.name, saved.description || '', saved.id)
    }

    return saved
  },

  async deleteObjective(id) {
    const userId = storageUserIdFromState(get())
    const objectives = get().objectives.filter((o) => o.id !== id)
    set({ objectives })
    await persistObjectives(objectives, userId)
  },

  async changeObjectiveLevel(id, newLevel) {
    const userId = storageUserIdFromState(get())
    const objectives = get().objectives.slice()
    const i = objectives.findIndex((o) => o.id === id)
    if (i < 0) return { ok: false, reason: 'Objectif introuvable' }

    const obj = objectives[i]!
    objectives[i] = {
      ...obj,
      level: clampObjectiveLevel(newLevel),
      lastLevelChangeAt: new Date().toISOString(),
    }

    set({ objectives })
    await persistObjectives(objectives, userId)
    return { ok: true }
  },

  async setCalculatedFreeTime(minutes, date) {
    const userId = storageUserIdFromState(get())
    const now = new Date().toISOString()
    set({
      calculatedDailyFreeMinutes: Math.max(0, Math.min(1440, Math.round(minutes))),
      calculatedAt: now,
      lastCalculatedDate: date,
    })
    await persistLevels(get(), userId)
  },

  async reconcileWithHistory(history, rules) {
    const userId = storageUserIdFromState(get())
    const cursor = get().lastProcessedSessionId
    const sorted = [...history].sort(
      (a, b) => new Date(a.endedAt).getTime() - new Date(b.endedAt).getTime(),
    )
    const startIndex = cursor ? Math.max(0, sorted.findIndex((h) => h.sessionId === cursor) + 1) : 0
    const objectiveDeltas = new Map<string, number>()
    let newCursor = cursor

    for (let i = startIndex; i < sorted.length; i++) {
      const entry = sorted[i]!
      newCursor = entry.sessionId
      if (!entry.completedNormally) continue

      const linkedRuleIds = rules
        .filter((r) => r.linkedProfileId === entry.profileId)
        .map((r) => r.id)
      if (linkedRuleIds.length === 0) continue

      for (const objective of get().objectives) {
        if (!objective.linkedRuleIds.some((ruleId) => linkedRuleIds.includes(ruleId))) continue
        objectiveDeltas.set(
          objective.id,
          (objectiveDeltas.get(objective.id) ?? 0) + durationMinutes(entry),
        )
      }
    }

    if (newCursor !== cursor) {
      set({ lastProcessedSessionId: newCursor })
      await persistLevels(get(), userId)
    }

    const deltas = [...objectiveDeltas.entries()].map(([objectiveId, minutes]) => ({
      objectiveId,
      minutes,
    }))
    if (deltas.length > 0) {
      await useTasksStore.getState().applyObjectiveProgress(deltas)
      set({
        lastProgressEvent: {
          at: new Date().toISOString(),
          objectiveDeltas: deltas,
        },
      })
    }
  },

  consumeProgressEvent() {
    set({ lastProgressEvent: null })
  },

  async persistPriorityScores(results) {
    const userId = storageUserIdFromState(get())
    const byId = new Map(
      results
        .filter((result) => result.kind === 'objective')
        .map((result) => [result.targetId, result]),
    )
    let changed = false
    const objectives = get().objectives.map((objective) => {
      const result = byId.get(objective.id)
      if (!result) return objective
      const score = toPersistedPriorityScore(result)
      if (samePersistedPriorityScore(objective.priorityScoreV2, score)) return objective
      changed = true
      return { ...objective, priorityScoreV2: score }
    })
    if (!changed) return
    set({ objectives })
    await persistObjectives(objectives, userId)
  },
}))
