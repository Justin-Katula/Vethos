import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import type {
  DeclaredAppUsageState,
  StorageKey,
} from '@shared/schemas'
import type { AppCategory } from '@shared/app-categories'
import type { Theme } from '@shared/theme'
import type { StopReason } from '@shared/schemas'

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
        id?: string
        name: string
        exeName: string
        exePath: string
        publisher: string
        category: AppCategory | null
        classificationState?: 'RESOLVED' | 'UNRESOLVED'
        classificationSource?: string
        classificationReasonCode?: string
        classifierVersion?: number
        iconDataUrl?: string
      }>
    > => ipcRenderer.invoke(IPC_CHANNELS.APP_DISCOVERY_LIST),
    /** Relance un scan complet des applications installées. */
    refreshInstalledApps: (): Promise<
      Array<{
        id?: string
        name: string
        exeName: string
        exePath: string
        publisher: string
        category: AppCategory | null
        classificationState?: 'RESOLVED' | 'UNRESOLVED'
        classificationSource?: string
        classificationReasonCode?: string
        classifierVersion?: number
        iconDataUrl?: string
      }>
    > => ipcRenderer.invoke(IPC_CHANNELS.APP_DISCOVERY_REFRESH),
    /** Définit une correction manuelle de catégorie pour une application (autorité maximale). */
    setUserOverride: (appId: string, category: AppCategory): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_SET_USER_OVERRIDE, appId, category),
    /** Réinitialise la catégorie vers sa résolution automatique. */
    resetUserOverride: (appId: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_RESET_USER_OVERRIDE, appId),
    /** Écoute les mises à jour et réconciliations du catalogue en direct. */
    onCatalogUpdated: (
      cb: (
        apps: Array<{
          id?: string
          name: string
          exeName: string
          exePath: string
          publisher: string
          category: AppCategory | null
          classificationState?: 'RESOLVED' | 'UNRESOLVED'
          classificationSource?: string
          classificationReasonCode?: string
          classifierVersion?: number
          iconDataUrl?: string
        }>,
      ) => void,
    ): (() => void) => {
      const listener = (
        _: unknown,
        apps: Array<{
          id?: string
          name: string
          exeName: string
          exePath: string
          publisher: string
          category: AppCategory | null
          classificationState?: 'RESOLVED' | 'UNRESOLVED'
          classificationSource?: string
          classificationReasonCode?: string
          classifierVersion?: number
          iconDataUrl?: string
        }>,
      ) => cb(apps)
      ipcRenderer.on(IPC_CHANNELS.APP_EVENT_CATALOG_UPDATED, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.APP_EVENT_CATALOG_UPDATED, listener)
    },
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
    /** Le thème résolu, pour que le fond de fenêtre et la barre système suivent. */
    setTheme: (theme: Theme): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_SET_THEME, theme),
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
    /** Blocage intelligent par IA à partir du plan */
    getAppKnowledgeBase: (): Promise<{ profiles: Record<string, unknown> }> =>
      ipcRenderer.invoke(IPC_CHANNELS.INTELLIGENT_BLOCKING_GET_KNOWLEDGE),
    decideIntelligentBlocking: (args: {
      title: string
      plan: string
      detectedApps?: Array<{ identifiant: string; nom_affiche: string; publisher?: string }>
    }): Promise<{
      blockedApps: Array<{ identifiant: string; nom_affiche: string; raison: string; iconDataUrl?: string }>
      allowedApps?: Array<{ identifiant: string; nom_affiche: string; raison: string; iconDataUrl?: string }>
      questionIds?: string[]
      decisionState?: 'RESOLVED' | 'INCOMPLETE_APP_KNOWLEDGE' | 'BLOCK_DECISION_AI_FAILED'
    }> => ipcRenderer.invoke(IPC_CHANNELS.INTELLIGENT_BLOCKING_DECIDE, args),
    reviewBlockModification: (args: {
      title: string
      plan: string
      identifiant: string
      action: 'add' | 'remove'
      userJustification?: string
    }): Promise<{
      accepted: boolean
      reason: string
    }> => ipcRenderer.invoke(IPC_CHANNELS.INTELLIGENT_BLOCKING_REVIEW_REQUEST, args),
    onProgress: (
      cb: (progress: {
        newBlockedApps: Array<{ identifiant: string; nom_affiche: string; raison: string; iconDataUrl?: string }>
        newAllowedApps?: Array<{ identifiant: string; nom_affiche: string; raison: string; iconDataUrl?: string }>
        processedCount: number
        totalCount: number
        currentCategory: string
      }) => void,
    ): (() => void) => {
      const listener = (
        _: unknown,
        payload: {
          newBlockedApps: Array<{ identifiant: string; nom_affiche: string; raison: string; iconDataUrl?: string }>
          newAllowedApps?: Array<{ identifiant: string; nom_affiche: string; raison: string; iconDataUrl?: string }>
          processedCount: number
          totalCount: number
          currentCategory: string
        },
      ) => cb(payload)
      ipcRenderer.on(IPC_CHANNELS.INTELLIGENT_BLOCKING_STREAM_PROGRESS, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.INTELLIGENT_BLOCKING_STREAM_PROGRESS, listener)
    },
  },
  planning: {
    /** D.7/D.8 : confirme « Je commence » pour ce bloc. Démarre réellement le blocage de ses apps_à_bloquer. */
    confirmBlock: (blockId: string): Promise<ConfirmBlockResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.PLANNING_CONFIRM_BLOCK, blockId),
    /** « Stop » : arrête la séance en cours, avec une raison en un tap (spec 2026-09-25). */
    stopBlock: (args: { reason: StopReason | null; text?: string; answerMs?: number }): Promise<ConfirmBlockResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.PLANNING_STOP_BLOCK, args),
    /** Poussé par l'horloge de planification dès qu'elle écrit du retard, un raté, ou une confirmation. */
    onChanged: (cb: () => void): (() => void) => {
      const listener = () => cb()
      ipcRenderer.on(IPC_CHANNELS.PLANNING_EVENT_CHANGED, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.PLANNING_EVENT_CHANGED, listener)
    },
  },
}

export type BlockingSessionState = {
  active: boolean
  blockedAppIds: string[]
  endsAt: number | null
}

export type ConfirmBlockResult = { ok: true } | { ok: false; reason: string }

contextBridge.exposeInMainWorld('nexus', api)

export type NexusApi = typeof api
