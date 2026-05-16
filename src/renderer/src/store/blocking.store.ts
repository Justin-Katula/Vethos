import { create } from 'zustand'
import { nexus } from '@/lib/ipc'
import type { ActiveSession, BlockingProfile, BlockingState } from '@shared/schemas'
import type { LayerStatus } from '../../../preload/index'

type BlockingStore = {
  loaded: boolean
  elevated: boolean
  state: BlockingState
  active: ActiveSession | null
  layerStatus: LayerStatus

  load: () => Promise<void>
  saveProfile: (
    draft: Partial<BlockingProfile> & { name: string },
  ) => Promise<BlockingProfile>
  deleteProfile: (id: string) => Promise<void>
  startSession: (profileId: string, minutes: number) => Promise<void>
  requestUnlock: () => Promise<void>
  submitJustification: (text: string) => Promise<{ ok: true } | { ok: false; reason: string }>
  refreshLayerStatus: () => Promise<void>
  requestElevation: () => Promise<void>
}

export const useBlockingStore = create<BlockingStore>((set, get) => ({
  loaded: false,
  elevated: false,
  state: { profiles: [], history: [], nextSessionPenaltyMinutes: 0 },
  active: null,
  layerStatus: { hosts: 'inactive', processes: 'inactive', firewall: 'inactive' },

  async load() {
    const [elevated, initial] = await Promise.all([
      nexus.blocking.isElevated(),
      nexus.blocking.getInitialState(),
    ])
    set({ loaded: true, elevated, state: initial.state, active: initial.active })
    nexus.blocking.onSessionChanged((s) => {
      set({ active: s })
      if (!s) {
        void nexus.blocking.getInitialState().then((next) => {
          set({ state: next.state, active: next.active })
        })
      }
      void get().refreshLayerStatus()
    })
    nexus.blocking.onLayerDrift(() => {
      void get().refreshLayerStatus()
    })
    void get().refreshLayerStatus()
  },

  async saveProfile(draft) {
    const saved = await nexus.blocking.saveProfile(draft)
    const profiles = get().state.profiles.slice()
    const i = profiles.findIndex((p) => p.id === saved.id)
    if (i >= 0) profiles[i] = saved
    else profiles.push(saved)
    set({ state: { ...get().state, profiles } })
    return saved
  },

  async deleteProfile(id) {
    await nexus.blocking.deleteProfile(id)
    set({
      state: {
        ...get().state,
        profiles: get().state.profiles.filter((p) => p.id !== id),
      },
    })
  },

  async startSession(profileId, minutes) {
    const s = await nexus.blocking.startSession({ profileId, durationMinutes: minutes })
    set({ active: s })
    void get().refreshLayerStatus()
  },

  async requestUnlock() {
    await nexus.blocking.requestUnlock()
  },

  async submitJustification(text) {
    return nexus.blocking.submitJustification(text)
  },

  async refreshLayerStatus() {
    const s = await nexus.blocking.getLayerStatus()
    set({ layerStatus: s })
  },

  async requestElevation() {
    await nexus.blocking.requestElevation()
  },
}))
