import { create } from 'zustand'
import { vethos } from '@/lib/ipc'
import type { ScheduleEntry, ScheduleState, TimeRule } from '@shared/schemas'
import { hasOverlap } from '@/lib/schedule-selectors'
import { assertStorageWrite } from '@/lib/storage-write'
import { useToastStore } from './toast.store'
import {
  normalizeStorageUserId,
  resolveStorageUserId,
  storageUserIdFromState,
} from './scoped-storage'

type SaveRuleDraft = {
  id?: string
  name: string
  color: string
  icon?: string
  categoryType?: TimeRule['categoryType']
  linkedProfileId?: string | null
}

type SaveEntryDraft = {
  id?: string
  ruleId: string
  dayOfWeek: number
  startMinute: number
  endMinute: number
}

type ScheduleStore = {
  userId: string | null
  loaded: boolean
  rules: TimeRule[]
  entries: ScheduleEntry[]

  setUserId: (userId?: string | null) => void
  reset: () => void
  load: (userId?: string) => Promise<void>
  saveRule: (draft: SaveRuleDraft) => Promise<TimeRule>
  deleteRule: (id: string) => Promise<void>
  saveEntry: (draft: SaveEntryDraft) => Promise<ScheduleEntry>
  deleteEntry: (id: string) => Promise<void>
  /** Remplace l'intégralité du schedule (rules + entries). Utilisé par l'onboarding. */
  replaceAll: (rules: TimeRule[], entries: ScheduleEntry[]) => Promise<void>
}

const SCHEDULE_DEBOUNCE_MS = 500
const DEFAULT_SCHEDULE_STATE = {
  userId: null,
  loaded: false,
  rules: [],
  entries: [],
}

let pendingState: { state: ScheduleState; userId: string } | null = null
let persistTimer: ReturnType<typeof setTimeout> | null = null
let pendingResolvers: Array<{
  resolve: () => void
  reject: (err: unknown) => void
}> = []

function uuid(): string {
  return crypto.randomUUID()
}

function notifyPersistError(err: unknown): void {
  useToastStore.getState().push({
    variant: 'error',
    title: 'Sauvegarde planning échouée',
    description: err instanceof Error ? err.message : String(err),
  })
}

async function writeSchedule(state: ScheduleState, userId?: string): Promise<void> {
  if (!userId) return
  try {
    const result = await vethos.storage.write('schedule', state, userId)
    assertStorageWrite(result, 'schedule')
  } catch (err) {
    notifyPersistError(err)
    throw err
  }
}

function clearPendingSchedulePersist(): void {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  const waiters = pendingResolvers
  pendingState = null
  pendingResolvers = []
  waiters.forEach(({ resolve }) => resolve())
}

export async function flushSchedulePersist(): Promise<void> {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  if (!pendingState) return

  const { state, userId } = pendingState
  const waiters = pendingResolvers
  pendingState = null
  pendingResolvers = []

  try {
    await writeSchedule(state, userId)
    waiters.forEach(({ resolve }) => resolve())
  } catch (err) {
    waiters.forEach(({ reject }) => reject(err))
  }
}

function persistDebounced(state: ScheduleState, userId?: string): Promise<void> {
  if (!userId) return Promise.resolve()
  pendingState = { state, userId }
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    void flushSchedulePersist()
  }, SCHEDULE_DEBOUNCE_MS)

  return new Promise((resolve, reject) => {
    pendingResolvers.push({ resolve, reject })
  })
}

export const useScheduleStore = create<ScheduleStore>((set, get) => ({
  ...DEFAULT_SCHEDULE_STATE,

  setUserId(rawUserId) {
    const userId = normalizeStorageUserId(rawUserId) ?? null
    if (get().userId === userId) return
    clearPendingSchedulePersist()
    set({ ...DEFAULT_SCHEDULE_STATE, userId })
  },

  reset() {
    clearPendingSchedulePersist()
    set({ ...DEFAULT_SCHEDULE_STATE })
  },

  async load(rawUserId) {
    const userId = resolveStorageUserId(rawUserId, get())
    if (!userId) {
      get().reset()
      return
    }
    if (get().userId !== userId) {
      clearPendingSchedulePersist()
      set({ ...DEFAULT_SCHEDULE_STATE, userId })
    }

    const stored = await vethos.storage.read<ScheduleState>('schedule', userId)
    if (stored) {
      set({ userId, loaded: true, rules: stored.rules, entries: stored.entries })
    } else {
      set({ userId, loaded: true, rules: [], entries: [] })
    }
  },

  async saveRule(draft) {
    const userId = storageUserIdFromState(get())
    const now = new Date().toISOString()
    const rules = get().rules.slice()
    let saved: TimeRule
    if (draft.id) {
      const i = rules.findIndex((r) => r.id === draft.id)
      if (i < 0) throw new Error(`Règle introuvable : ${draft.id}`)
      saved = {
        ...rules[i]!,
        name: draft.name,
        color: draft.color,
        icon: draft.icon,
        categoryType: draft.categoryType ?? rules[i]!.categoryType,
        linkedProfileId: draft.linkedProfileId ?? null,
      }
      rules[i] = saved
    } else {
      saved = {
        id: uuid(),
        name: draft.name,
        color: draft.color,
        icon: draft.icon,
        categoryType: draft.categoryType ?? 'custom',
        linkedProfileId: draft.linkedProfileId ?? null,
        createdAt: now,
      }
      rules.push(saved)
    }
    set({ rules })
    await persistDebounced({ rules, entries: get().entries }, userId)
    return saved
  },

  async deleteRule(id) {
    const userId = storageUserIdFromState(get())
    const rules = get().rules.filter((r) => r.id !== id)
    const entries = get().entries.filter((e) => e.ruleId !== id)
    set({ rules, entries })
    await persistDebounced({ rules, entries }, userId)
  },

  async saveEntry(draft) {
    const userId = storageUserIdFromState(get())
    if (draft.endMinute <= draft.startMinute) {
      throw new Error('Fin doit être après le début')
    }
    if (!get().rules.some((r) => r.id === draft.ruleId)) {
      throw new Error('Règle inconnue')
    }
    const entries = get().entries.slice()
    if (
      hasOverlap(entries, {
        id: draft.id,
        dayOfWeek: draft.dayOfWeek,
        startMinute: draft.startMinute,
        endMinute: draft.endMinute,
      })
    ) {
      throw new Error('Chevauchement avec une autre entrée')
    }
    const now = new Date().toISOString()
    let saved: ScheduleEntry
    if (draft.id) {
      const i = entries.findIndex((e) => e.id === draft.id)
      if (i < 0) throw new Error(`Entrée introuvable : ${draft.id}`)
      saved = {
        ...entries[i]!,
        ruleId: draft.ruleId,
        dayOfWeek: draft.dayOfWeek,
        startMinute: draft.startMinute,
        endMinute: draft.endMinute,
      }
      entries[i] = saved
    } else {
      saved = {
        id: uuid(),
        ruleId: draft.ruleId,
        dayOfWeek: draft.dayOfWeek,
        startMinute: draft.startMinute,
        endMinute: draft.endMinute,
        createdAt: now,
      }
      entries.push(saved)
    }
    set({ entries })
    await persistDebounced({ rules: get().rules, entries }, userId)
    return saved
  },

  async deleteEntry(id) {
    const userId = storageUserIdFromState(get())
    const entries = get().entries.filter((e) => e.id !== id)
    set({ entries })
    await persistDebounced({ rules: get().rules, entries }, userId)
  },

  async replaceAll(rules, entries) {
    const userId = storageUserIdFromState(get())
    set({ rules, entries })
    await persistDebounced({ rules, entries }, userId)
  },
}))
