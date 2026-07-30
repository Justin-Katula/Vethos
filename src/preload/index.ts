import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import type {
  DeclaredAppUsageState,
  StorageKey,
} from '@shared/schemas'
import type { AppCategory } from '@shared/app-categories'

export type StorageWriteResult = { ok: true } | { ok: false; error: string }

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
    discoverInstalledApps: (): Promise<
      Array<{
        name: string
        exeName: string
        exePath: string
        publisher: string
        category: AppCategory
        iconDataUrl?: string
      }>
    > => ipcRenderer.invoke(IPC_CHANNELS.APP_DISCOVERY_LIST),
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
  appUsage: {
    get: (): Promise<DeclaredAppUsageState> => ipcRenderer.invoke(IPC_CHANNELS.APP_USAGE_GET),
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
  blocking: {
    /**
     * État courant de la session, décidé par l'horloge du processus principal.
     * L'interface ne le calcule jamais elle-même : une seule source de vérité.
     */
    getSession: (): Promise<BlockingSessionState> =>
      ipcRenderer.invoke(IPC_CHANNELS.BLOCKING_GET_SESSION),
    onSessionChange: (cb: (state: BlockingSessionState) => void): (() => void) => {
      const listener = (_: unknown, payload: BlockingSessionState) => cb(payload)
      ipcRenderer.on(IPC_CHANNELS.BLOCKING_EVENT_SESSION, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.BLOCKING_EVENT_SESSION, listener)
    },
  },
}

export type BlockingSessionState = {
  active: boolean
  blockedAppIds: string[]
  endsAt: number | null
}

contextBridge.exposeInMainWorld('nexus', api)

export type NexusApi = typeof api
