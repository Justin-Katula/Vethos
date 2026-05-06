import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import type {
  ActiveSession,
  BlockingProfile,
  BlockingState,
  DeclaredAppUsageState,
  StorageKey,
} from '@shared/schemas'

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
    write: <T>(key: StorageKey, data: T): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.STORAGE_WRITE, key, data),
    exists: (key: StorageKey): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.STORAGE_EXISTS, key),
  },
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_VERSION),
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
}

contextBridge.exposeInMainWorld('nexus', api)

export type NexusApi = typeof api
