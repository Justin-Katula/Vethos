import { create } from 'zustand'
import { nexus } from '@/lib/ipc'
import type { ActiveSession, BlockingProfile, BlockingState } from '@shared/schemas'
import type { LayerStatus, ServiceStatus } from '../../../preload/index'

const EMPTY_STATE: BlockingState = { profiles: [], history: [], nextSessionPenaltyMinutes: 0 }
const INACTIVE_LAYER_STATUS: LayerStatus = {
  hosts: 'inactive',
  processes: 'inactive',
  firewall: 'inactive',
}

type BlockingStore = {
  loaded: boolean
  serviceStatus: ServiceStatus
  serviceRepairing: boolean
  state: BlockingState
  active: ActiveSession | null
  layerStatus: LayerStatus

  load: () => Promise<void>
  saveProfile: (draft: Partial<BlockingProfile> & { name: string }) => Promise<BlockingProfile>
  deleteProfile: (id: string) => Promise<void>
  startSession: (profileId: string, minutes: number) => Promise<void>
  requestUnlock: () => Promise<void>
  submitJustification: (text: string) => Promise<{ ok: true } | { ok: false; reason: string }>
  refreshLayerStatus: () => Promise<void>
  refreshServiceStatus: () => Promise<ServiceStatus>
  repairService: () => Promise<boolean>
}

export const useBlockingStore = create<BlockingStore>((set, get) => {
  let subscribed = false

  async function loadServiceState(): Promise<boolean> {
    try {
      const initial = await nexus.blocking.getInitialState()
      set({ state: initial.state, active: initial.active, serviceStatus: 'ok' })
      return true
    } catch {
      set({ active: null, layerStatus: INACTIVE_LAYER_STATUS, serviceStatus: 'unavailable' })
      return false
    }
  }

  function subscribeToServiceEvents(): void {
    if (subscribed) return
    subscribed = true

    nexus.blocking.onServiceStatus((status) => {
      set({ serviceStatus: status })
      if (status === 'ok') {
        void loadServiceState().then((available) => {
          if (available) void get().refreshLayerStatus()
        })
      } else {
        set({ active: null, layerStatus: INACTIVE_LAYER_STATUS })
      }
    })
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
  }

  return {
    loaded: false,
    serviceStatus: 'unavailable',
    serviceRepairing: false,
    state: EMPTY_STATE,
    active: null,
    layerStatus: INACTIVE_LAYER_STATUS,

    async load() {
      subscribeToServiceEvents()
      const serviceStatus = await get().refreshServiceStatus()
      set({ loaded: true })
      if (serviceStatus === 'ok' && (await loadServiceState())) {
        void get().refreshLayerStatus()
      }
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
      set({ active: s, serviceStatus: 'ok' })
      void get().refreshLayerStatus()
    },

    async requestUnlock() {
      await nexus.blocking.requestUnlock()
    },

    async submitJustification(text) {
      return nexus.blocking.submitJustification(text)
    },

    async refreshLayerStatus() {
      try {
        const s = await nexus.blocking.getLayerStatus()
        set({ layerStatus: s, serviceStatus: 'ok' })
      } catch {
        set({ layerStatus: INACTIVE_LAYER_STATUS, serviceStatus: 'unavailable' })
      }
    },

    async refreshServiceStatus() {
      const status = await nexus.blocking
        .getServiceStatus()
        .catch((): ServiceStatus => 'unavailable')
      set({ serviceStatus: status })
      return status
    },

    async repairService() {
      set({ serviceRepairing: true })
      try {
        const launched = await nexus.blocking.repairService()
        await get().refreshServiceStatus()
        return launched
      } finally {
        set({ serviceRepairing: false })
      }
    },
  }
})
