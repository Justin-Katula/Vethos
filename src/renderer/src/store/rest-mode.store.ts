import { create } from 'zustand'

type RestModeState = {
  activeUntil: number | null
  reason: string | null
  reset: () => void
  triggerRest: (minutes: number, reason?: string) => void
  clearExpired: (now?: number) => void
}

const DEFAULT_REST_MODE_STATE = {
  activeUntil: null,
  reason: null,
}

export const useRestModeStore = create<RestModeState>((set, get) => ({
  ...DEFAULT_REST_MODE_STATE,

  reset() {
    set({ ...DEFAULT_REST_MODE_STATE })
  },

  triggerRest(minutes, reason) {
    const durationMs = Math.max(1, Math.round(minutes)) * 60_000
    set({
      activeUntil: Date.now() + durationMs,
      reason: reason ?? 'pause',
    })
  },

  clearExpired(now = Date.now()) {
    const activeUntil = get().activeUntil
    if (activeUntil !== null && activeUntil <= now) {
      set({ activeUntil: null, reason: null })
    }
  },
}))
