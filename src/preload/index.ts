import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import type {
  ActiveSession,
  BlockingProfile,
  BlockingState,
  DeclaredAppUsageState,
  StorageKey,
} from '@shared/schemas'

export type StorageWriteResult = { ok: true } | { ok: false; error: string }

export type LayerStatusValue = 'ok' | 'drifted' | 'error' | 'inactive'
export type LayerStatus = {
  hosts: LayerStatusValue
  processes: LayerStatusValue
  firewall: LayerStatusValue
}

const api = {
  storage: {
    read: <T>(key: StorageKey): Promise<T | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.STORAGE_READ, key),
    write: <T>(key: StorageKey, data: T): Promise<StorageWriteResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.STORAGE_WRITE, key, data),
    exists: (key: StorageKey): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.STORAGE_EXISTS, key),
  },
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_VERSION),
    openLogs: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.APP_OPEN_LOGS),
    onFlushDebounces: (cb: () => void): (() => void) => {
      const listener = () => cb()
      ipcRenderer.on(IPC_CHANNELS.APP_FLUSH_DEBOUNCES, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.APP_FLUSH_DEBOUNCES, listener)
    },
    onUpdateAvailable: (cb: (info: { version?: string }) => void): (() => void) => {
      const listener = (_: unknown, payload: { version?: string }) => cb(payload)
      ipcRenderer.on(IPC_CHANNELS.UPDATER_EVENT_AVAILABLE, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.UPDATER_EVENT_AVAILABLE, listener)
    },
    onUpdateDownloaded: (cb: (info: { version?: string }) => void): (() => void) => {
      const listener = (_: unknown, payload: { version?: string }) => cb(payload)
      ipcRenderer.on(IPC_CHANNELS.UPDATER_EVENT_DOWNLOADED, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.UPDATER_EVENT_DOWNLOADED, listener)
    },
  },
  blocking: {
    getInitialState: (): Promise<{ state: BlockingState; active: ActiveSession | null }> =>
      ipcRenderer.invoke(IPC_CHANNELS.BLOCKING_GET_INITIAL_STATE),
    saveProfile: (draft: Partial<BlockingProfile> & { name: string }): Promise<BlockingProfile> =>
      ipcRenderer.invoke(IPC_CHANNELS.BLOCKING_SAVE_PROFILE, draft),
    deleteProfile: (id: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.BLOCKING_DELETE_PROFILE, id),
    startSession: (args: {
      profileId: string
      durationMinutes: number
    }): Promise<ActiveSession> => ipcRenderer.invoke(IPC_CHANNELS.BLOCKING_START_SESSION, args),
    requestUnlock: (): Promise<ActiveSession['unlockState']> =>
      ipcRenderer.invoke(IPC_CHANNELS.BLOCKING_REQUEST_UNLOCK),
    submitJustification: (text: string): Promise<{ ok: true } | { ok: false; reason: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.BLOCKING_SUBMIT_JUSTIFICATION, text),
    getLayerStatus: (): Promise<LayerStatus> =>
      ipcRenderer.invoke(IPC_CHANNELS.BLOCKING_GET_LAYER_STATUS),
    isElevated: (): Promise<boolean> => ipcRenderer.invoke(IPC_CHANNELS.BLOCKING_IS_ELEVATED),
    requestElevation: (): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.BLOCKING_REQUEST_ELEVATION),
    onSessionChanged: (cb: (s: ActiveSession | null) => void): (() => void) => {
      const listener = (_: unknown, payload: ActiveSession | null) => cb(payload)
      ipcRenderer.on(IPC_CHANNELS.BLOCKING_EVENT_SESSION_CHANGED, listener)
      return () =>
        ipcRenderer.removeListener(IPC_CHANNELS.BLOCKING_EVENT_SESSION_CHANGED, listener)
    },
    onLayerDrift: (cb: (e: { layer: string; restored: boolean }) => void): (() => void) => {
      const listener = (_: unknown, payload: { layer: string; restored: boolean }) => cb(payload)
      ipcRenderer.on(IPC_CHANNELS.BLOCKING_EVENT_LAYER_DRIFT, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.BLOCKING_EVENT_LAYER_DRIFT, listener)
    },
    onClockTamper: (cb: (e: { driftMs: number }) => void): (() => void) => {
      const listener = (_: unknown, payload: { driftMs: number }) => cb(payload)
      ipcRenderer.on(IPC_CHANNELS.BLOCKING_EVENT_CLOCK_TAMPER, listener)
      return () =>
        ipcRenderer.removeListener(IPC_CHANNELS.BLOCKING_EVENT_CLOCK_TAMPER, listener)
    },
  },
  appUsage: {
    get: (): Promise<DeclaredAppUsageState> =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_USAGE_GET),
    onTick: (cb: (state: DeclaredAppUsageState) => void): (() => void) => {
      const listener = (_: unknown, payload: DeclaredAppUsageState) => cb(payload)
      ipcRenderer.on(IPC_CHANNELS.APP_USAGE_EVENT_TICK, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.APP_USAGE_EVENT_TICK, listener)
    },
  },
  tasks: {
    /** V2 P9 — Demande au main de fire une notification native pour cet event. */
    notify: (
      event:
        | { type: 'task-hit-zero'; taskTitle: string }
        | { type: 'task-auto-rescued'; taskTitle: string; daysLeft: number }
        | { type: 'task-forced-three'; taskTitle: string }
        | { type: 'task-degraded'; taskTitle: string; newLevel: number }
        | { type: 'task-urgent'; taskTitle: string; daysLeft: number },
    ): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.TASKS_NOTIFY, event),
  },
}

contextBridge.exposeInMainWorld('nexus', api)

export type NexusApi = typeof api
