import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import type { BlockedAttemptPayload } from '@shared/blocking'
import type {
  ActiveSession,
  BlockingProfile,
  BlockingState,
  DeclaredAppUsageState,
  StorageKey,
} from '@shared/schemas'
import type { CoachResult } from '@shared/coach-result'
import type { DeepSeekChatRequest, DeepSeekChatResult } from '@shared/deepseek'
import type { UpdaterCheckResult, UpdaterEventInfo } from '@shared/updater'

export type StorageWriteResult = { ok: true } | { ok: false; error: string }

export type LayerStatusValue = 'ok' | 'drifted' | 'error' | 'inactive'
export type LayerStatus = {
  hosts: LayerStatusValue
  processes: LayerStatusValue
  firewall: LayerStatusValue
}
export type ServiceStatus = 'ok' | 'unavailable'

const api = {
  auth: {
    setUserId: (userId?: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.AUTH_SET_USER_ID, userId),
  },
  storage: {
    read: <T>(key: StorageKey, userId?: string): Promise<T | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.STORAGE_READ, key, userId),
    write: <T>(key: StorageKey, data: T, userId?: string): Promise<StorageWriteResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.STORAGE_WRITE, key, data, userId),
    exists: (key: StorageKey, userId?: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.STORAGE_EXISTS, key, userId),
  },
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_VERSION),
    openLogs: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.APP_OPEN_LOGS),
    discoverInstalledApps: (options?: { forceRefresh?: boolean }): Promise<
      Array<{
        name: string
        exeName: string
        exePath: string
        publisher: string
        source?: string
        packageId?: string
        hasExecutablePath?: boolean
        iconDataUrl?: string
      }>
    > => ipcRenderer.invoke(IPC_CHANNELS.APP_DISCOVERY_LIST, options),
    onFlushDebounces: (cb: () => void): (() => void) => {
      const listener = () => cb()
      ipcRenderer.on(IPC_CHANNELS.APP_FLUSH_DEBOUNCES, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.APP_FLUSH_DEBOUNCES, listener)
    },
    checkForUpdates: (): Promise<UpdaterCheckResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.UPDATER_CHECK_NOW),
    onUpdateAvailable: (cb: (info: UpdaterEventInfo) => void): (() => void) => {
      const listener = (_: unknown, payload: UpdaterEventInfo) => cb(payload)
      ipcRenderer.on(IPC_CHANNELS.UPDATER_EVENT_AVAILABLE, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.UPDATER_EVENT_AVAILABLE, listener)
    },
    onUpdateDownloaded: (cb: (info: UpdaterEventInfo) => void): (() => void) => {
      const listener = (_: unknown, payload: UpdaterEventInfo) => cb(payload)
      ipcRenderer.on(IPC_CHANNELS.UPDATER_EVENT_DOWNLOADED, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.UPDATER_EVENT_DOWNLOADED, listener)
    },
  },
  blocking: {
    getInitialState: (
      userId?: string,
    ): Promise<{ state: BlockingState; active: ActiveSession | null }> =>
      ipcRenderer.invoke(IPC_CHANNELS.BLOCKING_GET_INITIAL_STATE, userId),
    saveProfile: (
      draft: Partial<BlockingProfile> & { name: string },
      userId?: string,
    ): Promise<BlockingProfile> =>
      ipcRenderer.invoke(IPC_CHANNELS.BLOCKING_SAVE_PROFILE, draft, userId),
    deleteProfile: (id: string, userId?: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.BLOCKING_DELETE_PROFILE, id, userId),
    startSession: (
      args: { profileId: string; durationMinutes: number },
      userId?: string,
    ): Promise<ActiveSession> =>
      ipcRenderer.invoke(IPC_CHANNELS.BLOCKING_START_SESSION, args, userId),
    startTest: (userId?: string): Promise<ActiveSession> =>
      ipcRenderer.invoke(IPC_CHANNELS.BLOCKING_START_TEST, userId),
    requestUnlock: (userId?: string): Promise<ActiveSession['unlockState']> =>
      ipcRenderer.invoke(IPC_CHANNELS.BLOCKING_REQUEST_UNLOCK, userId),
    submitJustification: (
      text: string,
      userId?: string,
    ): Promise<{ ok: true } | { ok: false; reason: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.BLOCKING_SUBMIT_JUSTIFICATION, text, userId),
    submitAppExplanation: (args: {
      token: string
      text: string
    }): Promise<{ allowed: boolean; reason: string; allowMinutes: number }> =>
      ipcRenderer.invoke(IPC_CHANNELS.BLOCKING_SUBMIT_APP_EXPLANATION, args),
    minimizeAppWindow: (args: { token: string; windowId: string }): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.BLOCKING_MINIMIZE_APP_WINDOW, args),
    closeAppWindow: (args: { token: string; windowId: string }): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.BLOCKING_CLOSE_APP_WINDOW, args),
    getLayerStatus: (userId?: string): Promise<LayerStatus> =>
      ipcRenderer.invoke(IPC_CHANNELS.BLOCKING_GET_LAYER_STATUS, userId),
    getServiceStatus: (): Promise<ServiceStatus> =>
      ipcRenderer.invoke(IPC_CHANNELS.BLOCKING_GET_SERVICE_STATUS),
    repairService: (): Promise<boolean> => ipcRenderer.invoke(IPC_CHANNELS.BLOCKING_REPAIR_SERVICE),
    onServiceStatus: (cb: (s: ServiceStatus) => void): (() => void) => {
      const listener = (_: unknown, payload: ServiceStatus) => cb(payload)
      ipcRenderer.on(IPC_CHANNELS.BLOCKING_EVENT_SERVICE_STATUS, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.BLOCKING_EVENT_SERVICE_STATUS, listener)
    },
    onSessionChanged: (cb: (s: ActiveSession | null) => void): (() => void) => {
      const listener = (_: unknown, payload: ActiveSession | null) => cb(payload)
      ipcRenderer.on(IPC_CHANNELS.BLOCKING_EVENT_SESSION_CHANGED, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.BLOCKING_EVENT_SESSION_CHANGED, listener)
    },
    onLayerDrift: (cb: (e: { layer: string; restored: boolean }) => void): (() => void) => {
      const listener = (_: unknown, payload: { layer: string; restored: boolean }) => cb(payload)
      ipcRenderer.on(IPC_CHANNELS.BLOCKING_EVENT_LAYER_DRIFT, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.BLOCKING_EVENT_LAYER_DRIFT, listener)
    },
    onClockTamper: (cb: (e: { driftMs: number }) => void): (() => void) => {
      const listener = (_: unknown, payload: { driftMs: number }) => cb(payload)
      ipcRenderer.on(IPC_CHANNELS.BLOCKING_EVENT_CLOCK_TAMPER, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.BLOCKING_EVENT_CLOCK_TAMPER, listener)
    },
    onBreakRequired: (cb: (e: { reason: string; restMinutes: number }) => void): (() => void) => {
      const listener = (_: unknown, payload: { reason: string; restMinutes: number }) => cb(payload)
      ipcRenderer.on(IPC_CHANNELS.BLOCKING_EVENT_BREAK_REQUIRED, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.BLOCKING_EVENT_BREAK_REQUIRED, listener)
    },
    onBlockedAttempt: (cb: (e: BlockedAttemptPayload) => void): (() => void) => {
      const listener = (_: unknown, payload: BlockedAttemptPayload) => cb(payload)
      ipcRenderer.on(IPC_CHANNELS.BLOCKING_EVENT_BLOCKED_ATTEMPT, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.BLOCKING_EVENT_BLOCKED_ATTEMPT, listener)
    },
  },
  appUsage: {
    get: (userId?: string): Promise<DeclaredAppUsageState> =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_USAGE_GET, userId),
    onTick: (cb: (state: DeclaredAppUsageState) => void): (() => void) => {
      const listener = (_: unknown, payload: DeclaredAppUsageState) => cb(payload)
      ipcRenderer.on(IPC_CHANNELS.APP_USAGE_EVENT_TICK, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.APP_USAGE_EVENT_TICK, listener)
    },
  },
  registry: {
    onItemObserved: (
      cb: (item: { kind: 'site' | 'app'; identifier: string; displayName: string }) => void,
    ): (() => void) => {
      const listener = (
        _: unknown,
        payload: { kind: 'site' | 'app'; identifier: string; displayName: string },
      ) => cb(payload)
      ipcRenderer.on(IPC_CHANNELS.REGISTRY_EVENT_ITEM_OBSERVED, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.REGISTRY_EVENT_ITEM_OBSERVED, listener)
    },
  },
  deepseek: {
    chat: (request: DeepSeekChatRequest): Promise<DeepSeekChatResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.DEEPSEEK_CHAT, request),
  },
  coach: {
    analyzeTask: (args: {
      taskTitle: string
    }): Promise<CoachResult<{ clear: boolean; suggestedQuestion?: string }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.COACH_ANALYZE_TASK, args),
    generateSubtasks: (args: {
      taskTitle: string
      contextNotes: string
      totalMinutes: number
    }): Promise<CoachResult<Array<{ title: string; durationMinutes: number }>>> =>
      ipcRenderer.invoke(IPC_CHANNELS.COACH_GENERATE_SUBTASKS, args),
    categorizeApps: (args: {
      apps: Array<{ name: string; exeName: string }>
    }): Promise<CoachResult<Record<string, string>>> =>
      ipcRenderer.invoke(IPC_CHANNELS.COACH_CATEGORIZE_APPS, args),
    classifyAppsForTask: (args: {
      taskTitle: string
      contextNotes: string
      apps: Array<{ identifier: string; displayName: string }>
      currentUsefulApps: string[]
    }): Promise<CoachResult<Record<string, 'useful' | 'distraction' | 'neutral'>>> =>
      ipcRenderer.invoke(IPC_CHANNELS.COACH_CLASSIFY_APPS_FOR_TASK, args),
    classifyAppsForObjective: (args: {
      objectiveName: string
      objectiveDescription: string
      apps: Array<{ identifier: string; displayName: string }>
      currentUsefulApps: string[]
    }): Promise<CoachResult<Record<string, 'useful' | 'distraction' | 'neutral'>>> =>
      ipcRenderer.invoke(IPC_CHANNELS.COACH_CLASSIFY_APPS_FOR_OBJECTIVE, args),
  },
  tasks: {
    /** Demande au main de déclencher une notification native pour cet événement. */
    notify: (
      event:
        | { type: 'task-degraded'; taskTitle: string; newLevel: number }
        | { type: 'task-expired'; taskTitle: string }
        | { type: 'task-urgent'; taskTitle: string; daysLeft: number }
        | {
            type: 'work-block-started'
            title: string
            startLabel: string
            endLabel: string
          },
    ): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.TASKS_NOTIFY, event),
  },
}

contextBridge.exposeInMainWorld('vethos', api)

export type VethosApi = typeof api
