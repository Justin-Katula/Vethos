import { create } from 'zustand'
import { vethos } from '@/lib/ipc'
import type { Settings } from '@shared/schemas'
import { assertStorageWrite } from '@/lib/storage-write'
import { useToastStore } from './toast.store'
import {
  normalizeStorageUserId,
  resolveStorageUserId,
  storageUserIdFromState,
} from './scoped-storage'

type SettingsState = {
  userId: string | null
  username: string
  savedAt: string | null
  onboardingCompleted: boolean
  userProfile: 'student' | 'worker' | 'both' | 'other'
  sleepStart: string
  sleepEnd: string
  sleepLockdownSkippedDate: string | null
  chronotype: 'morning' | 'intermediate' | 'evening'
  detectedChronotype: 'morning' | 'intermediate' | 'evening' | null
  detectedWakeMinute: number | null
  detectedSleepMinute: number | null
  detectedPeakHour: number | null
  circadianMetricsUpdatedAt: string | null
  sessionRulesEnabled: boolean
  autoSave: boolean
  browserHistoryScanEnabled: boolean
  defaultUnlockCooldownMinutes: number
  defaultUnlockJustificationWords: number
  firstLaunchDate: string | null
  staticTomorrowPlanningEnabled: boolean
  closureRitualCompletedAt: string | null
  classificationMode: 'immediate' | 'batch_3h' | 'batch_1d' | 'batch_1w'
  /** Toggles runtime des moteurs V2 (true = V2 pilote, V1 fallback). */
  engineV2Placement: boolean
  engineV2Blocking: boolean
  engineV2Priority: boolean
  engineV2Completion: boolean
  engineV2Execution: boolean
  loaded: boolean

  setUserId: (userId?: string | null) => void
  reset: () => void
  load: (userId?: string) => Promise<void>
  save: (username: string) => Promise<void>
  setOnboardingCompleted: (completed: boolean) => Promise<void>
  updateSettings: (
    patch: Partial<
      Omit<
        SettingsState,
        | 'userId'
        | 'loaded'
        | 'setUserId'
        | 'reset'
        | 'load'
        | 'save'
        | 'setOnboardingCompleted'
        | 'updateSettings'
      >
    >,
  ) => Promise<void>
}

const DEFAULT_SETTINGS_STATE = {
  userId: null,
  username: '',
  savedAt: null,
  onboardingCompleted: false,
  userProfile: 'student' as const,
  sleepStart: '23:30',
  sleepEnd: '07:00',
  sleepLockdownSkippedDate: null,
  chronotype: 'intermediate' as const,
  detectedChronotype: null,
  detectedWakeMinute: null,
  detectedSleepMinute: null,
  detectedPeakHour: null,
  circadianMetricsUpdatedAt: null,
  sessionRulesEnabled: true,
  autoSave: true,
  browserHistoryScanEnabled: false,
  defaultUnlockCooldownMinutes: 10,
  defaultUnlockJustificationWords: 50,
  firstLaunchDate: null,
  staticTomorrowPlanningEnabled: true,
  closureRitualCompletedAt: null,
  classificationMode: 'immediate' as const,
  engineV2Placement: true,
  engineV2Blocking: true,
  engineV2Priority: true,
  engineV2Completion: true,
  engineV2Execution: true,
  loaded: false,
}

function buildPayload(state: SettingsState): Settings {
  return {
    username: state.username || undefined,
    savedAt: state.savedAt ?? undefined,
    onboardingCompleted: state.onboardingCompleted,
    userProfile: state.userProfile,
    sleepStart: state.sleepStart,
    sleepEnd: state.sleepEnd,
    sleepLockdownSkippedDate: state.sleepLockdownSkippedDate ?? undefined,
    chronotype: state.chronotype,
    detectedChronotype: state.detectedChronotype ?? undefined,
    detectedWakeMinute: state.detectedWakeMinute ?? undefined,
    detectedSleepMinute: state.detectedSleepMinute ?? undefined,
    detectedPeakHour: state.detectedPeakHour ?? undefined,
    circadianMetricsUpdatedAt: state.circadianMetricsUpdatedAt ?? undefined,
    sessionRulesEnabled: state.sessionRulesEnabled,
    autoSave: state.autoSave,
    browserHistoryScanEnabled: state.browserHistoryScanEnabled,
    defaultUnlockCooldownMinutes: state.defaultUnlockCooldownMinutes,
    defaultUnlockJustificationWords: state.defaultUnlockJustificationWords,
    firstLaunchDate: state.firstLaunchDate ?? undefined,
    staticTomorrowPlanningEnabled: state.staticTomorrowPlanningEnabled,
    closureRitualCompletedAt: state.closureRitualCompletedAt ?? undefined,
    classificationMode: state.classificationMode,
    engineV2Placement: state.engineV2Placement,
    engineV2Blocking: state.engineV2Blocking,
    engineV2Priority: state.engineV2Priority,
    engineV2Completion: state.engineV2Completion,
    engineV2Execution: state.engineV2Execution,
  }
}

async function persist(state: SettingsState): Promise<void> {
  const userId = storageUserIdFromState(state)
  if (!userId) return
  try {
    const result = await vethos.storage.write<Settings>('settings', buildPayload(state), userId)
    assertStorageWrite(result, 'settings')
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

function clearPendingUsernamePersist(): void {
  if (usernameTimer) {
    clearTimeout(usernameTimer)
    usernameTimer = null
  }
  const waiters = pendingUsernameResolvers
  pendingUsernameState = null
  pendingUsernameResolvers = []
  waiters.forEach(({ resolve }) => resolve())
}

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
  ...DEFAULT_SETTINGS_STATE,

  setUserId(rawUserId) {
    const userId = normalizeStorageUserId(rawUserId) ?? null
    if (get().userId === userId) return
    clearPendingUsernamePersist()
    set({ ...DEFAULT_SETTINGS_STATE, userId })
  },

  reset() {
    clearPendingUsernamePersist()
    set({ ...DEFAULT_SETTINGS_STATE })
  },

  async load(rawUserId) {
    const userId = resolveStorageUserId(rawUserId, get())
    if (!userId) {
      get().reset()
      return
    }
    if (get().userId !== userId) {
      clearPendingUsernamePersist()
      set({ ...DEFAULT_SETTINGS_STATE, userId })
    }

    const data = await vethos.storage.read<Settings>('settings', userId)
    const firstLaunch = data?.firstLaunchDate ?? null
    set({
      userId,
      username: data?.username ?? '',
      savedAt: data?.savedAt ?? null,
      onboardingCompleted: data?.onboardingCompleted ?? false,
      userProfile: data?.userProfile ?? 'student',
      sleepStart: data?.sleepStart ?? '23:30',
      sleepEnd: data?.sleepEnd ?? '07:00',
      sleepLockdownSkippedDate: data?.sleepLockdownSkippedDate ?? null,
      chronotype: data?.chronotype ?? 'intermediate',
      detectedChronotype: data?.detectedChronotype ?? null,
      detectedWakeMinute: data?.detectedWakeMinute ?? null,
      detectedSleepMinute: data?.detectedSleepMinute ?? null,
      detectedPeakHour: data?.detectedPeakHour ?? null,
      circadianMetricsUpdatedAt: data?.circadianMetricsUpdatedAt ?? null,
      sessionRulesEnabled: data?.sessionRulesEnabled ?? true,
      autoSave: data?.autoSave ?? true,
      browserHistoryScanEnabled: data?.browserHistoryScanEnabled ?? false,
      defaultUnlockCooldownMinutes: data?.defaultUnlockCooldownMinutes ?? 10,
      defaultUnlockJustificationWords: data?.defaultUnlockJustificationWords ?? 50,
      firstLaunchDate: firstLaunch,
      staticTomorrowPlanningEnabled: data?.staticTomorrowPlanningEnabled ?? true,
      closureRitualCompletedAt: data?.closureRitualCompletedAt ?? null,
      classificationMode: data?.classificationMode ?? 'immediate',
      engineV2Placement: data?.engineV2Placement ?? true,
      engineV2Blocking: data?.engineV2Blocking ?? true,
      engineV2Priority: data?.engineV2Priority ?? true,
      engineV2Completion: data?.engineV2Completion ?? true,
      engineV2Execution: data?.engineV2Execution ?? true,
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
    await persist(get())
  },

  async updateSettings(patch) {
    set((s) => ({ ...s, ...patch }))
    await persist(get())
  },
}))
