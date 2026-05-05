import { create } from 'zustand'
import { nexus } from '@/lib/ipc'
import type { Settings } from '@shared/schemas'

type SettingsState = {
  username: string
  savedAt: string | null
  loaded: boolean
  load: () => Promise<void>
  save: (username: string) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set) => ({
  username: '',
  savedAt: null,
  loaded: false,

  async load() {
    const data = await nexus.storage.read<Settings>('settings')
    set({
      username: data?.username ?? '',
      savedAt: data?.savedAt ?? null,
      loaded: true,
    })
  },

  async save(username: string) {
    const savedAt = new Date().toISOString()
    await nexus.storage.write<Settings>('settings', { username, savedAt })
    set({ username, savedAt })
  },
}))
