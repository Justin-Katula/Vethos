import { ipcMain, app, shell, type BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import type { Storage } from '@main/storage'
import { getLogFilePath } from '@main/logging/setup'
import { notifyTaskEvent, type TaskNotifyEvent } from '@main/notifications'
import { registerStorageHandlers } from './storage.handlers'
import { registerBlockingHandlers } from '../blocking/ipc/blocking.handlers'
import { registerAppUsageHandlers } from '../tracking/handlers'

export async function registerAllIpcHandlers(
  storage: Storage,
  getMainWindow: () => BrowserWindow | null,
): Promise<void> {
  registerStorageHandlers(storage)

  ipcMain.handle(IPC_CHANNELS.APP_GET_VERSION, () => app.getVersion())
  ipcMain.handle(IPC_CHANNELS.APP_OPEN_LOGS, async () => {
    await shell.openPath(getLogFilePath())
  })

  // V2 P9 — Notifications de niveau des tâches déclenchées depuis le
  // renderer (tasks.store). Le main reçoit l'event et déclenche la notif
  // native Windows correspondante.
  ipcMain.handle(IPC_CHANNELS.TASKS_NOTIFY, (_e, event: TaskNotifyEvent) => {
    notifyTaskEvent(event, getMainWindow)
  })

  await registerBlockingHandlers(storage, getMainWindow)
  await registerAppUsageHandlers(storage, getMainWindow)
}
