import { ipcMain, app, shell, type BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import type { Storage } from '@shared/storage'
import { getLogFilePath } from '@main/logging/setup'
import { notifyTaskEvent, type TaskNotifyEvent } from '@main/notifications'
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

  // V2 P9 — Notifications de niveau des tâches déclenchées depuis le
  // renderer (tasks.store). Le main reçoit l'event et déclenche la notif
  // native Windows correspondante.
  ipcMain.handle(IPC_CHANNELS.TASKS_NOTIFY, (_e, event: TaskNotifyEvent) => {
    notifyTaskEvent(event, getMainWindow)
  })

  await registerAppUsageHandlers(storage, getMainWindow)
}
