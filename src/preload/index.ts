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
    /** Relance un scan complet des applications installées. */
    refreshInstalledApps: (): Promise<
      Array<{
        name: string
        exeName: string
        exePath: string
        publisher: string
        category: AppCategory
        iconDataUrl?: string
      }>
    > => ipcRenderer.invoke(IPC_CHANNELS.APP_DISCOVERY_REFRESH),
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
    /** Critère 3 : le main doit connaître les heures de sommeil pour se taire. */
    setSleepWindow: (start: string | undefined, end: string | undefined): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_SET_SLEEP_WINDOW, start, end),
  },
  appUsage: {
    get: (): Promise<DeclaredAppUsageState> => ipcRenderer.invoke(IPC_CHANNELS.APP_USAGE_GET),
    onTick: (cb: (state: DeclaredAppUsageState) => void): (() => void) => {
      const listener = (_: unknown, payload: DeclaredAppUsageState) => cb(payload)
      ipcRenderer.on(IPC_CHANNELS.APP_USAGE_EVENT_TICK, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.APP_USAGE_EVENT_TICK, listener)
    },
  },
  blocking: {
    /**
     * État courant de la session, décidé par l'horloge du processus principal.
     * L'interface ne le calcule jamais elle-même : une seule source de vérité.
     */
    getSession: (): Promise<BlockingSessionState> =>
      ipcRenderer.invoke(IPC_CHANNELS.BLOCKING_GET_SESSION),
    /** Minimise la PAIRE overlay + fenêtre cible. Rend false si Windows refuse. */
    minimizeAppWindow: (args: { token: string; windowId: string }): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.BLOCKING_MINIMIZE_APP_WINDOW, args),
    /** Demande la fermeture propre de la fenêtre cible. Jamais un kill. */
    closeAppWindow: (args: { token: string; windowId: string }): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.BLOCKING_CLOSE_APP_WINDOW, args),
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
