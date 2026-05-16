import { create } from 'zustand'
import { nexus } from '@/lib/ipc'
import type { DeclaredAppUsageEntry, DeclaredAppUsageState } from '@shared/schemas'

type AppUsageStore = {
  loaded: boolean
  entries: DeclaredAppUsageEntry[]
  lastTickAt: string | null
  load: () => Promise<void>
  /** S'abonne aux ticks main → renderer. Retourne une fonction de désabonnement. */
  subscribe: () => () => void
}

function localDateToday(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export const useAppUsageStore = create<AppUsageStore>((set) => ({
  loaded: false,
  entries: [],
  lastTickAt: null,

  async load() {
    const state = await nexus.appUsage.get()
    set({
      loaded: true,
      entries: state.entries,
      lastTickAt: state.lastTickAt,
    })
  },

  subscribe() {
    return nexus.appUsage.onTick((state: DeclaredAppUsageState) => {
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
export function selectMinutesThisWeek(
  state: AppUsageStore,
  appId: string,
): number {
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
export function selectMinutesByDay(
  state: AppUsageStore,
  appId: string,
): Map<string, number> {
  const out = new Map<string, number>()
  for (const e of state.entries) {
    if (e.appId === appId) out.set(e.date, e.minutes)
  }
  return out
}
