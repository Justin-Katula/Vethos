import { create } from 'zustand'
import { nexus } from '@/lib/ipc'
import type { LearningState, LearningObservation } from '@shared/schemas'
import { assertStorageWrite } from '@/lib/storage-write'

type LearningStore = {
  loaded: boolean
  observations: LearningObservation[]
  anchorMissCounts: Record<string, number>

  load: () => Promise<void>
  addObservation: (obs: Omit<LearningObservation, 'createdAt'>) => Promise<void>
  incrementAnchorMiss: (ancreId: string) => Promise<void>
  resetAnchorMiss: (ancreId: string) => Promise<void>
}

const DEFAULT_STATE = {
  loaded: false,
  observations: [] as LearningObservation[],
  anchorMissCounts: {} as Record<string, number>,
}

async function persist(state: LearningStore): Promise<void> {
  const result = await nexus.storage.write<LearningState>('learning', {
    observations: state.observations,
    anchorMissCounts: state.anchorMissCounts,
  })
  assertStorageWrite(result, 'learning')
}

export const useLearningStore = create<LearningStore>((set, get) => ({
  ...DEFAULT_STATE,

  async load() {
    const state = await nexus.storage.read<LearningState>('learning')
    set({
      loaded: true,
      observations: state?.observations ?? [],
      anchorMissCounts: state?.anchorMissCounts ?? {},
    })
  },

  async addObservation(obs) {
    const observation: LearningObservation = { ...obs, createdAt: new Date().toISOString() }
    const observations = [...get().observations, observation].slice(-10000)
    set({ observations })
    await persist(get())
  },

  async incrementAnchorMiss(ancreId) {
    const counts = { ...get().anchorMissCounts }
    counts[ancreId] = (counts[ancreId] ?? 0) + 1
    set({ anchorMissCounts: counts })
    await persist(get())
  },

  async resetAnchorMiss(ancreId) {
    const counts = { ...get().anchorMissCounts }
    delete counts[ancreId]
    set({ anchorMissCounts: counts })
    await persist(get())
  },
}))
