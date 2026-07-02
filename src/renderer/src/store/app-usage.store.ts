import { create } from 'zustand'
import { vethos } from '@/lib/ipc'
import type { DeclaredAppUsageEntry, DeclaredAppUsageState } from '@shared/schemas'
import {
  normalizeStorageUserId,
  resolveStorageUserId,
  storageUserIdFromState,
} from './scoped-storage'

type AppUsageStore = {
  userId: string | null
  loaded: boolean
  entries: DeclaredAppUsageEntry[]
  lastTickAt: string | null
  setUserId: (userId?: string | null) => void
  reset: () => void
  load: (userId?: string) => Promise<void>
  /** S'abonne aux ticks main → renderer. Retourne une fonction de désabonnement. */
  subscribe: () => () => void
}

const DEFAULT_APP_USAGE_STATE = {
  userId: null,
  loaded: false,
  entries: [],
  lastTickAt: null,
}

function localDateToday(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export const useAppUsageStore = create<AppUsageStore>((set, get) => ({
  ...DEFAULT_APP_USAGE_STATE,

  setUserId(rawUserId) {
    const userId = normalizeStorageUserId(rawUserId) ?? null
    if (get().userId === userId) return
    set({ ...DEFAULT_APP_USAGE_STATE, userId })
  },

  reset() {
    set({ ...DEFAULT_APP_USAGE_STATE })
  },

  async load(rawUserId) {
    const userId = resolveStorageUserId(rawUserId, get())
    if (!userId) {
      get().reset()
      return
    }
    if (get().userId !== userId) {
      set({ ...DEFAULT_APP_USAGE_STATE, userId })
    }
    const state = await vethos.appUsage.get(userId)
    set({
      userId,
      loaded: true,
      entries: state.entries,
      lastTickAt: state.lastTickAt,
    })
  },

  subscribe() {
    return vethos.appUsage.onTick((state: DeclaredAppUsageState) => {
      if (!storageUserIdFromState(get())) return
      set({
        loaded: true,
        entries: state.entries,
        lastTickAt: state.lastTickAt,
      })
    })
  },
}))

/** Sélecteur : minutes du jour pour une app. */
export function selectMinutesToday(state: AppUsageStore, appId: string): number {
  const today = localDateToday()
  let total = 0
  for (const e of state.entries) {
    if (e.appId === appId && e.date === today) total += e.minutes
  }
  return total
}

/** Sélecteur : minutes des 7 derniers jours pour une app. */
export function selectMinutesThisWeek(state: AppUsageStore, appId: string): number {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 6)
  const cutoffStr = cutoff.toISOString().slice(0, 10)
  let total = 0
  for (const e of state.entries) {
    if (e.appId === appId && e.date >= cutoffStr) total += e.minutes
  }
  return total
}

/** Sélecteur : map appId → minutes par jour, utilisée par les progressions. */
export function selectMinutesByDay(state: AppUsageStore, appId: string): Map<string, number> {
  const out = new Map<string, number>()
  for (const e of state.entries) {
    if (e.appId === appId) out.set(e.date, e.minutes)
  }
  return out
}
