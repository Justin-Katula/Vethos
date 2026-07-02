import { create } from 'zustand'
import { vethos } from '@/lib/ipc'
import type { ActiveSession, BlockingProfile, BlockingState } from '@shared/schemas'
import type { LayerStatus, ServiceStatus } from '../../../preload/index'
import {
  normalizeStorageUserId,
  resolveStorageUserId,
  storageUserIdFromState,
} from './scoped-storage'
import { useUserModelStore } from './user-model.store'
import { createSessionCompletedEvent, createSessionStartedEvent, createUnlockAcceptedEvent, createUnlockRefusedEvent, createUnlockRequestedEvent } from '@/lib/user-event-collector'
import { useDecisionLogStore } from './decision-log.store'
import { buildLearningUpdatesFromUnlockRequest, gateLearningUpdate } from '@/lib/learning-engine'

const EMPTY_STATE: BlockingState = { profiles: [], history: [], nextSessionPenaltyMinutes: 0 }
const INACTIVE_LAYER_STATUS: LayerStatus = {
  hosts: 'inactive',
  processes: 'inactive',
  firewall: 'inactive',
}

type BlockingStore = {
  userId: string | null
  loaded: boolean
  serviceStatus: ServiceStatus
  serviceRepairing: boolean
  state: BlockingState
  active: ActiveSession | null
  layerStatus: LayerStatus

  setUserId: (userId?: string | null) => void
  reset: () => void
  load: (userId?: string) => Promise<void>
  saveProfile: (draft: Partial<BlockingProfile> & { name: string }) => Promise<BlockingProfile>
  deleteProfile: (id: string) => Promise<void>
  startSession: (profileId: string, minutes: number) => Promise<void>
  startTest: () => Promise<void>
  requestUnlock: () => Promise<void>
  submitJustification: (text: string) => Promise<{ ok: true } | { ok: false; reason: string }>
  refreshLayerStatus: () => Promise<void>
  refreshServiceStatus: () => Promise<ServiceStatus>
  repairService: () => Promise<boolean>
}

const DEFAULT_BLOCKING_STATE = {
  userId: null,
  loaded: false,
  serviceStatus: 'unavailable' as ServiceStatus,
  serviceRepairing: false,
  state: EMPTY_STATE,
  active: null,
  layerStatus: INACTIVE_LAYER_STATUS,
}

export const useBlockingStore = create<BlockingStore>((set, get) => {
  let subscribed = false

  async function loadServiceState(): Promise<boolean> {
    const userId = storageUserIdFromState(get())
    if (!userId) {
      set({ active: null, state: EMPTY_STATE, layerStatus: INACTIVE_LAYER_STATUS })
      return false
    }
    try {
      const initial = await vethos.blocking.getInitialState(userId)
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

    vethos.blocking.onServiceStatus((status) => {
      set({ serviceStatus: status })
      if (!storageUserIdFromState(get())) return
      if (status === 'ok') {
        void loadServiceState().then((available) => {
          if (available) void get().refreshLayerStatus()
        })
      } else {
        set({ active: null, layerStatus: INACTIVE_LAYER_STATUS })
      }
    })
    vethos.blocking.onSessionChanged((s) => {
      const userId = storageUserIdFromState(get())
      if (!userId) return
      const previous = get().active
      set({ active: s })
      if (s && !previous) void useUserModelStore.getState().recordEvent(createSessionStartedEvent(s))
      if (!s) {
        if (previous) void useUserModelStore.getState().recordEvent(createSessionCompletedEvent({ ...previous, endedAt: new Date().toISOString() }))
        void vethos.blocking.getInitialState(userId).then((next) => {
          set({ state: next.state, active: next.active })
        })
      }
      void get().refreshLayerStatus()
    })
    vethos.blocking.onLayerDrift(() => {
      void get().refreshLayerStatus()
    })
  }

  return {
    ...DEFAULT_BLOCKING_STATE,

    setUserId(rawUserId) {
      const userId = normalizeStorageUserId(rawUserId) ?? null
      if (get().userId === userId) return
      set({ ...DEFAULT_BLOCKING_STATE, userId })
    },

    reset() {
      set({ ...DEFAULT_BLOCKING_STATE })
    },

    async load(rawUserId) {
      const userId = resolveStorageUserId(rawUserId, get())
      if (!userId) {
        get().reset()
        return
      }
      if (get().userId !== userId) {
        set({ ...DEFAULT_BLOCKING_STATE, userId })
      }
      subscribeToServiceEvents()
      const serviceStatus = await get().refreshServiceStatus()
      set({ loaded: true })
      if (serviceStatus === 'ok' && (await loadServiceState())) {
        void get().refreshLayerStatus()
      }
    },

    async saveProfile(draft) {
      const userId = storageUserIdFromState(get())
      if (!userId) throw new Error('Utilisateur non connecté')
      const saved = await vethos.blocking.saveProfile(draft, userId)
      const profiles = get().state.profiles.slice()
      const i = profiles.findIndex((p) => p.id === saved.id)
      if (i >= 0) profiles[i] = saved
      else profiles.push(saved)
      set({ state: { ...get().state, profiles } })
      return saved
    },

    async deleteProfile(id) {
      const userId = storageUserIdFromState(get())
      if (!userId) throw new Error('Utilisateur non connecté')
      await vethos.blocking.deleteProfile(id, userId)
      set({
        state: {
          ...get().state,
          profiles: get().state.profiles.filter((p) => p.id !== id),
        },
      })
    },

    async startSession(profileId, minutes) {
      const userId = storageUserIdFromState(get())
      if (!userId) throw new Error('Utilisateur non connecté')
      const s = await vethos.blocking.startSession({ profileId, durationMinutes: minutes }, userId)
      set({ active: s })
      if (s.protectionResult) {
        void useDecisionLogStore.getState().record({
          type: 'blocking',
          targetType: 'session',
          targetId: s.id,
          protectionResult: s.protectionResult,
        })
      }
      void get().refreshLayerStatus()
    },

    async startTest() {
      const userId = storageUserIdFromState(get())
      if (!userId) throw new Error('Utilisateur non connecté')
      const session = await vethos.blocking.startTest(userId)
      set({ active: session })
      void get().refreshLayerStatus()
    },

    async requestUnlock() {
      const userId = storageUserIdFromState(get())
      if (!userId) throw new Error('Utilisateur non connecté')
      await vethos.blocking.requestUnlock(userId)
      const active = get().active
      void useUserModelStore.getState().recordEvent(createUnlockRequestedEvent({ sessionId: active?.id }))
    },

    async submitJustification(text) {
      const userId = storageUserIdFromState(get())
      if (!userId) return { ok: false, reason: 'Utilisateur non connecté' }
      const result = await vethos.blocking.submitJustification(text, userId)
      const request = { sessionId: get().active?.id }
      void useUserModelStore.getState().recordEvent(result.ok ? createUnlockAcceptedEvent(request, { decision: 'allowed' }) : createUnlockRefusedEvent(request, { decision: 'denied', reason: result.reason }))
      for (const learningUpdate of buildLearningUpdatesFromUnlockRequest(
        { targetType: undefined, targetId: undefined, createdAt: new Date().toISOString() },
        { decision: result.ok ? 'allowed' : 'denied' },
      )) {
        const learningHistory = useDecisionLogStore.getState().entries.flatMap((entry) => entry.learningUpdate ? [entry.learningUpdate] : [])
        const effectiveUpdate = gateLearningUpdate(learningUpdate, learningHistory)
        void useDecisionLogStore.getState().record({
          type: 'learning_signal',
          targetType: effectiveUpdate.targetType,
          targetId: effectiveUpdate.targetId,
          learningUpdate: effectiveUpdate,
        })
      }
      return result
    },

    async refreshLayerStatus() {
      const userId = storageUserIdFromState(get())
      if (!userId) {
        set({ layerStatus: INACTIVE_LAYER_STATUS })
        return
      }
      try {
        const s = await vethos.blocking.getLayerStatus(userId)
        set({ layerStatus: s, serviceStatus: 'ok' })
      } catch {
        set({ layerStatus: INACTIVE_LAYER_STATUS, serviceStatus: 'unavailable' })
      }
    },

    async refreshServiceStatus() {
      const status = await vethos.blocking
        .getServiceStatus()
        .catch((): ServiceStatus => 'unavailable')
      set({ serviceStatus: status })
      return status
    },

    async repairService() {
      set({ serviceRepairing: true })
      try {
        // Le statut post-réparation revient par l'événement BLOCKING_EVENT_
        // SERVICE_STATUS poussé par le main — pas besoin de re-sonder ici.
        return await vethos.blocking.repairService()
      } finally {
        set({ serviceRepairing: false })
      }
    },
  }
})
