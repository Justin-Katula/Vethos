import { ipcMain, app } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import type { Storage } from '@main/storage'
import { registerStorageHandlers } from './storage.handlers'

export function registerAllIpcHandlers(storage: Storage): void {
  registerStorageHandlers(storage)

  ipcMain.handle(IPC_CHANNELS.APP_GET_VERSION, () => app.getVersion())
}
