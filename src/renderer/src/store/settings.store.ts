import type { Contract } from '@shared/contract'
import { create } from 'zustand'
import { nexus } from '@/lib/ipc'
import type { Settings } from '@shared/schemas'
import {
  DEFAULT_DARK_AT,
  DEFAULT_LIGHT_AT,
  DEFAULT_THEME_MODE,
  type ThemeMode,
} from '@shared/theme'
import { assertStorageWrite } from '@/lib/storage-write'
import { useToastStore } from './toast.store'

export const DEFAULT_SLEEP_START = '23:30'
export const DEFAULT_SLEEP_END = '07:00'

type SettingsState = {
  username: string
  savedAt: string | null
  onboardingCompleted: boolean
  /** Source unique du sommeil : capacité brute (A.1) et silence nocturne (critère 3). */
  sleepStart: string
  sleepEnd: string
  /**
   * Apparence. Le mode est le CHOIX ; l'écran qui en sort est calculé ailleurs
   * (`shared/theme.ts`). Les deux heures restent mémorisées même quand le mode
   * ne s'en sert pas, pour qu'un aller-retour ne fasse pas perdre le réglage.
   */
  theme: ThemeMode
  themeLightAt: string
  themeDarkAt: string
  /**
   * Clé DeepSeek de l'utilisateur. Vide par défaut, et l'application marche très
   * bien ainsi : tout le classement local est déterministe et hors ligne.
   */
  deepseekApiKey: string
  /** Le contrat d'Ulysse, s'il a été signé. */
  contract: Contract | null
  loaded: boolean

  load: () => Promise<void>
  save: (username: string) => Promise<void>
  setOnboardingCompleted: (completed: boolean) => Promise<void>
  updateSettings: (
    patch: Partial<
      Pick<
        SettingsState,
        | 'username'
        | 'sleepStart'
        | 'sleepEnd'
        | 'theme'
        | 'themeLightAt'
        | 'themeDarkAt'
        | 'deepseekApiKey'
        | 'contract'
      >
    >,
  ) => Promise<void>
}

function buildPayload(state: SettingsState): Settings {
  return {
    username: state.username || undefined,
    savedAt: state.savedAt ?? undefined,
    onboardingCompleted: state.onboardingCompleted,
    sleepStart: state.sleepStart,
    sleepEnd: state.sleepEnd,
    theme: state.theme,
    themeLightAt: state.themeLightAt,
    themeDarkAt: state.themeDarkAt,
    deepseekApiKey: state.deepseekApiKey || undefined,
    ...(state.contract ? { contract: state.contract } : {}),
  }
}

/** Le processus principal doit toujours connaître la plage de silence. */
function syncSleepWindow(state: SettingsState): void {
  void nexus.app.setSleepWindow(state.sleepStart, state.sleepEnd).catch(() => undefined)
}

async function persist(state: SettingsState): Promise<void> {
  try {
    const result = await nexus.storage.write<Settings>('settings', buildPayload(state))
    assertStorageWrite(result, 'settings')
    syncSleepWindow(state)
  } catch (err) {
    notifyPersistError(err)
    throw err
  }
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
    title: 'Settings save failed',
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
  sleepStart: DEFAULT_SLEEP_START,
  sleepEnd: DEFAULT_SLEEP_END,
  theme: DEFAULT_THEME_MODE,
  themeLightAt: DEFAULT_LIGHT_AT,
  themeDarkAt: DEFAULT_DARK_AT,
  deepseekApiKey: '',
  contract: null,
  loaded: false,

  async load() {
    const data = await nexus.storage.read<Settings>('settings')
    set({
      username: data?.username ?? '',
      savedAt: data?.savedAt ?? null,
      onboardingCompleted: data?.onboardingCompleted ?? false,
      sleepStart: data?.sleepStart ?? DEFAULT_SLEEP_START,
      sleepEnd: data?.sleepEnd ?? DEFAULT_SLEEP_END,
      // Rien de choisi = suivre l'ordinateur. Une installation neuve ne décide
      // pas d'une apparence à la place de l'utilisateur.
      theme: data?.theme ?? DEFAULT_THEME_MODE,
      themeLightAt: data?.themeLightAt ?? DEFAULT_LIGHT_AT,
      themeDarkAt: data?.themeDarkAt ?? DEFAULT_DARK_AT,
      deepseekApiKey: data?.deepseekApiKey ?? '',
      contract: data?.contract ?? null,
      loaded: true,
    })
    syncSleepWindow(get())
  },

  async save(username: string) {
    const savedAt = new Date().toISOString()
    set({ username, savedAt })
    await persistUsernameDebounced(get())
  },

  async setOnboardingCompleted(completed: boolean) {
    set({ onboardingCompleted: completed })
    await persist(get())
  },

  async updateSettings(patch) {
    set((s) => ({ ...s, ...patch }))
    await persist(get())
  },
}))
