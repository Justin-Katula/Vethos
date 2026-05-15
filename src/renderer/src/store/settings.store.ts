import { create } from 'zustand'
import { nexus } from '@/lib/ipc'
import type { Settings } from '@shared/schemas'
import { assertStorageWrite } from '@/lib/storage-write'
import { useToastStore } from './toast.store'

type SettingsState = {
  username: string
  savedAt: string | null
  onboardingCompleted: boolean
  userProfile: 'student' | 'worker' | 'both' | 'other'
  sleepStart: string
  sleepEnd: string
  sessionRulesEnabled: boolean
  strictBlocking: boolean
  antiBypass: boolean
  autoSave: boolean
  browserHistoryScanEnabled: boolean
  firstLaunchDate: string | null
  loaded: boolean

  load: () => Promise<void>
  save: (username: string) => Promise<void>
  setOnboardingCompleted: (completed: boolean) => Promise<void>
  updateSettings: (patch: Partial<Omit<SettingsState, 'loaded' | 'load' | 'save' | 'setOnboardingCompleted' | 'updateSettings'>>) => Promise<void>
}

function buildPayload(state: SettingsState): Settings {
  return {
    username: state.username || undefined,
    savedAt: state.savedAt ?? undefined,
    onboardingCompleted: state.onboardingCompleted,
    userProfile: state.userProfile,
    sleepStart: state.sleepStart,
    sleepEnd: state.sleepEnd,
    sessionRulesEnabled: state.sessionRulesEnabled,
    strictBlocking: state.strictBlocking,
    antiBypass: state.antiBypass,
    autoSave: state.autoSave,
    browserHistoryScanEnabled: state.browserHistoryScanEnabled,
    firstLaunchDate: state.firstLaunchDate ?? undefined,
  }
}

async function persist(state: SettingsState): Promise<void> {
  const result = await nexus.storage.write<Settings>('settings', buildPayload(state))
  assertStorageWrite(result, 'settings')
}

const USERNAME_DEBOUNCE_MS = 400
let usernameTimer: ReturnType<typeof setTimeout> | null = null
let pendingUsernameState: SettingsState | null = null
let pendingUsernameResolvers: Array<{
  resolve: () => void
  reject: (err: unknown) => void
}> = []

function notifyPersistError(err: unknown): void {
  useToastStore.getState().push({
    variant: 'error',
    title: 'Sauvegarde paramètres échouée',
    description: err instanceof Error ? err.message : String(err),
  })
}

export async function flushSettingsPersist(): Promise<void> {
  if (usernameTimer) {
    clearTimeout(usernameTimer)
    usernameTimer = null
  }
  if (!pendingUsernameState) return
  const state = pendingUsernameState
  const waiters = pendingUsernameResolvers
  pendingUsernameState = null
  pendingUsernameResolvers = []

  try {
    await persist(state)
    waiters.forEach(({ resolve }) => resolve())
  } catch (err) {
    notifyPersistError(err)
    waiters.forEach(({ reject }) => reject(err))
  }
}

function persistUsernameDebounced(state: SettingsState): Promise<void> {
  pendingUsernameState = state
  if (usernameTimer) clearTimeout(usernameTimer)
  usernameTimer = setTimeout(() => {
    void flushSettingsPersist()
  }, USERNAME_DEBOUNCE_MS)

  return new Promise((resolve, reject) => {
    pendingUsernameResolvers.push({ resolve, reject })
  })
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  username: '',
  savedAt: null,
  onboardingCompleted: false,
  userProfile: 'student',
  sleepStart: '23:30',
  sleepEnd: '07:00',
  sessionRulesEnabled: true,
  strictBlocking: true,
  antiBypass: true,
  autoSave: true,
  browserHistoryScanEnabled: false,
  firstLaunchDate: null,
  loaded: false,

  async load() {
    const data = await nexus.storage.read<Settings>('settings')
    const firstLaunch = data?.firstLaunchDate ?? null
    set({
      username: data?.username ?? '',
      savedAt: data?.savedAt ?? null,
      onboardingCompleted: data?.onboardingCompleted ?? false,
      userProfile: data?.userProfile ?? 'student',
      sleepStart: data?.sleepStart ?? '23:30',
      sleepEnd: data?.sleepEnd ?? '07:00',
      sessionRulesEnabled: data?.sessionRulesEnabled ?? true,
      strictBlocking: data?.strictBlocking ?? true,
      antiBypass: data?.antiBypass ?? true,
      autoSave: data?.autoSave ?? true,
      browserHistoryScanEnabled: data?.browserHistoryScanEnabled ?? false,
      firstLaunchDate: firstLaunch,
      loaded: true,
    })
    // Enregistrer la date du premier lancement si pas encore fait
    if (!firstLaunch) {
      const now = new Date().toISOString()
      set({ firstLaunchDate: now })
      await persist({ ...get(), firstLaunchDate: now })
    }
  },

  async save(username: string) {
    const savedAt = new Date().toISOString()
    set({ username, savedAt })
    await persistUsernameDebounced(get())
  },

  async setOnboardingCompleted(completed: boolean) {
    set({ onboardingCompleted: completed })
    await persist(get()).catch((err) => {
      notifyPersistError(err)
      throw err
    })
  },

  async updateSettings(patch) {
    set((s) => ({ ...s, ...patch }))
    await persist(get()).catch((err) => {
      notifyPersistError(err)
      throw err
    })
  },
}))
