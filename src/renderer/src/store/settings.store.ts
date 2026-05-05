import { create } from 'zustand'
import { nexus } from '@/lib/ipc'
import type { Settings } from '@shared/schemas'

type SettingsState = {
  username: string
  savedAt: string | null
  onboardingCompleted: boolean
  loaded: boolean
  load: () => Promise<void>
  save: (username: string) => Promise<void>
  setOnboardingCompleted: (completed: boolean) => Promise<void>
}

async function persist(state: {
  username: string
  savedAt: string | null
  onboardingCompleted: boolean
}): Promise<void> {
  const payload: Settings = {
    username: state.username || undefined,
    savedAt: state.savedAt ?? undefined,
    onboardingCompleted: state.onboardingCompleted,
  }
  await nexus.storage.write<Settings>('settings', payload)
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  username: '',
  savedAt: null,
  onboardingCompleted: false,
  loaded: false,

  async load() {
    const data = await nexus.storage.read<Settings>('settings')
    set({
      username: data?.username ?? '',
      savedAt: data?.savedAt ?? null,
      onboardingCompleted: data?.onboardingCompleted ?? false,
      loaded: true,
    })
  },

  async save(username: string) {
    const savedAt = new Date().toISOString()
    const next = {
      username,
      savedAt,
      onboardingCompleted: get().onboardingCompleted,
    }
    await persist(next)
    set(next)
  },

  async setOnboardingCompleted(completed: boolean) {
    const next = {
      username: get().username,
      savedAt: get().savedAt,
      onboardingCompleted: completed,
    }
    await persist(next)
    set({ onboardingCompleted: completed })
  },
}))
