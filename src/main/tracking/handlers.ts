import { ipcMain, type BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import type { Storage } from '@main/storage'
import type { DeclaredAppsState, DeclaredAppUsageState } from '@shared/schemas'
import { listProcesses } from '../blocking/processes/enumerator'
import { createTracker, type Tracker } from './app-usage-tracker'

export async function registerAppUsageHandlers(
  storage: Storage,
  getMainWindow: () => BrowserWindow | null,
): Promise<Tracker> {
  const tracker = createTracker({
    storage: {
      read: () => storage.read('declared_app_usage'),
      write: (state: DeclaredAppUsageState) =>
        storage.write('declared_app_usage', state),
    },
    getDeclaredApps: async () => {
      const declared = (await storage.read('declared_apps')) as DeclaredAppsState | null
      return declared?.apps ?? []
    },
    listProcesses,
    onFlush: (state) => {
      const win = getMainWindow()
      if (win && !win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.APP_USAGE_EVENT_TICK, state)
      }
    },
  })

  await tracker.hydrate()

  ipcMain.handle(IPC_CHANNELS.APP_USAGE_GET, () => tracker.getState())

  // Démarre le tick (60s) + flush (30s)
  tracker.start()

  return tracker
}
