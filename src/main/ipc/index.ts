import { ipcMain, app, type BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import type { Storage } from '@main/storage'
import { registerStorageHandlers } from './storage.handlers'
import { registerBlockingHandlers } from '../blocking/ipc/blocking.handlers'

export async function registerAllIpcHandlers(
  storage: Storage,
  getMainWindow: () => BrowserWindow | null,
): Promise<void> {
  registerStorageHandlers(storage)

  ipcMain.handle(IPC_CHANNELS.APP_GET_VERSION, () => app.getVersion())

  await registerBlockingHandlers(storage, getMainWindow)
}
