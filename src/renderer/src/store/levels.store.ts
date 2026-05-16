import { create } from 'zustand'
import { nexus } from '@/lib/ipc'
import type {
  BlockingHistoryEntry,
  LevelsState,
  Objective,
  ObjectivesState,
  TimeRule,
} from '@shared/schemas'
import { canChangeLevel, clampManualLevelChange } from '@/lib/free-time-calculator'
import { assertStorageWrite } from '@/lib/storage-write'
import { useToastStore } from './toast.store'

type SaveObjectiveDraft = {
  id?: string
  name: string
  description?: string
  color: string
  icon?: string
  linkedRuleIds?: string[]
  level?: number
  deadline?: string
  protectedCommitments?: string[]
}

export type ProgressEvent = {
  at: string
  objectiveDeltas: Array<{ objectiveId: string; minutes: number }>
}

type LevelsStore = {
  loaded: boolean
  objectives: Objective[]
  calculatedDailyFreeMinutes: number
  calculatedAt: string | null
  lastCalculatedDate: string | null
  lastProcessedSessionId: string | null
  lastProgressEvent: ProgressEvent | null

  load: () => Promise<void>
  saveObjective: (draft: SaveObjectiveDraft) => Promise<Objective>
  deleteObjective: (id: string) => Promise<void>
  changeObjectiveLevel: (id: string, newLevel: number) => Promise<{ ok: boolean; reason?: string }>
  setCalculatedFreeTime: (minutes: number, date: string) => Promise<void>
  reconcileWithHistory: (
    history: BlockingHistoryEntry[],
    rules: TimeRule[],
  ) => Promise<void>
  consumeProgressEvent: () => void
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
  }
}

async function persistObjectives(objectives: Objective[]): Promise<void> {
  const result = await nexus.storage.write<ObjectivesState>('objectives', { objectives })
  try {
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

async function persistLevels(state: LevelsStore): Promise<void> {
  const result = await nexus.storage.write<LevelsState>('levels', buildLevelsPayload(state))
  try {
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
  loaded: false,
  objectives: [],
  calculatedDailyFreeMinutes: 0,
  calculatedAt: null,
  lastCalculatedDate: null,
  lastProcessedSessionId: null,
  lastProgressEvent: null,

  async load() {
    const [objectiveState, levels] = await Promise.all([
      nexus.storage.read<ObjectivesState>('objectives'),
      nexus.storage.read<LevelsState>('levels'),
    ])

    const migratedObjectives = objectiveState?.objectives ?? levels?.objectives ?? []

    set({
      loaded: true,
      objectives: migratedObjectives,
      calculatedDailyFreeMinutes: levels?.calculatedDailyFreeMinutes ?? 0,
      calculatedAt: levels?.calculatedAt ?? null,
      lastCalculatedDate: levels?.lastCalculatedDate ?? null,
      lastProcessedSessionId: levels?.lastProcessedSessionId ?? null,
    })

    if (!objectiveState && migratedObjectives.length > 0) {
      await persistObjectives(migratedObjectives)
    }
    await persistLevels(get())
  },

  async saveObjective(draft) {
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
        deadline: draft.deadline || undefined,
        protectedCommitments: draft.protectedCommitments ?? objectives[i]!.protectedCommitments,
        linkedRuleIds: draft.linkedRuleIds ?? objectives[i]!.linkedRuleIds,
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
        level: draft.level ?? 5,
        deadline: draft.deadline || undefined,
        protectedCommitments: draft.protectedCommitments,
        createdAt: now,
      }
      objectives.push(saved)
    }
    set({ objectives })
    await persistObjectives(objectives)
    return saved
  },

  async deleteObjective(id) {
    const objectives = get().objectives.filter((o) => o.id !== id)
    set({ objectives })
    await persistObjectives(objectives)
  },

  async changeObjectiveLevel(id, newLevel) {
    const objectives = get().objectives.slice()
    const i = objectives.findIndex((o) => o.id === id)
    if (i < 0) return { ok: false, reason: 'Objectif introuvable' }

    const obj = objectives[i]!
    if (!canChangeLevel(obj.lastLevelChangeAt)) {
      return { ok: false, reason: 'Tu dois attendre 2 jours entre chaque modification de niveau.' }
    }

    objectives[i] = {
      ...obj,
      level: clampManualLevelChange(obj.level, newLevel),
      lastLevelChangeAt: new Date().toISOString(),
    }

    set({ objectives })
    await persistObjectives(objectives)
    return { ok: true }
  },

  async setCalculatedFreeTime(minutes, date) {
    const now = new Date().toISOString()
    set({
      calculatedDailyFreeMinutes: Math.max(0, Math.min(1440, Math.round(minutes))),
      calculatedAt: now,
      lastCalculatedDate: date,
    })
    await persistLevels(get())
  },

  async reconcileWithHistory(history, rules) {
    const cursor = get().lastProcessedSessionId
    const sorted = [...history].sort(
      (a, b) => new Date(a.endedAt).getTime() - new Date(b.endedAt).getTime(),
    )
    const startIndex = cursor
      ? Math.max(0, sorted.findIndex((h) => h.sessionId === cursor) + 1)
      : 0
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
      await persistLevels(get())
    }

    const deltas = [...objectiveDeltas.entries()].map(([objectiveId, minutes]) => ({
      objectiveId,
      minutes,
    }))
    if (deltas.length > 0) {
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
}))
