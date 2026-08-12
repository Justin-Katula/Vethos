import { ipcMain, app, shell, type BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import type { Storage } from '@shared/storage'
import { getLogFilePath } from '@main/logging/setup'
import { setSleepWindow } from '@main/notifications'
import { getAppCatalog } from '@main/tracking/app-catalog'
import { registerStorageHandlers } from './storage.handlers'
import { registerAppUsageHandlers } from '../tracking/handlers'

export type BlockingSessionState = {
  active: boolean
  blockedAppIds: string[]
  endsAt: number | null
}

export async function registerAllIpcHandlers(
  storage: Storage,
  getMainWindow: () => BrowserWindow | null,
  getBlockingSession: () => BlockingSessionState,
): Promise<void> {
  registerStorageHandlers(storage)

  // L'état de session est décidé par l'horloge du processus principal. Le
  // renderer le lit, il ne le recalcule jamais — une seule source de vérité.
  ipcMain.handle(IPC_CHANNELS.BLOCKING_GET_SESSION, () => getBlockingSession())

  ipcMain.handle(IPC_CHANNELS.APP_GET_VERSION, () => app.getVersion())
  ipcMain.handle(IPC_CHANNELS.APP_OPEN_LOGS, async () => {
    await shell.openPath(getLogFilePath())
  })
  // Par défaut on sert le catalogue en cache : le scan complet est trop lourd
  // pour être refait à chaque ouverture de la page.
  ipcMain.handle(IPC_CHANNELS.APP_DISCOVERY_LIST, () => getAppCatalog())
  ipcMain.handle(IPC_CHANNELS.APP_DISCOVERY_REFRESH, () => getAppCatalog({ force: true }))

  // Critère 3 : le processus principal doit connaître les heures de sommeil
  // pour n'émettre aucune notification pendant celles-ci. Le renderer les
  // pousse dès qu'il charge — ou les modifie — les paramètres.
  ipcMain.handle(IPC_CHANNELS.APP_SET_SLEEP_WINDOW, (_e, start: unknown, end: unknown) => {
    setSleepWindow(typeof start === 'string' ? start : undefined, typeof end === 'string' ? end : undefined)
  })

  await registerAppUsageHandlers(storage, getMainWindow)
}
