import { app, type BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import log from '@main/logging/setup'
import { notifyUpdateReady } from '../notifications'

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000
const STARTUP_GRACE_MS = 60_000

let started = false

export function startUpdater(getMainWindow: () => BrowserWindow | null): void {
  if (started || !app.isPackaged) return
  started = true

  autoUpdater.logger = log
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  const check = (): void => {
    autoUpdater.checkForUpdates().catch((err) => {
      log.warn('updater check failed', err)
    })
  }

  setTimeout(check, STARTUP_GRACE_MS)
  setInterval(check, FOUR_HOURS_MS)

  autoUpdater.on('update-available', (info) => {
    const win = getMainWindow()
    win?.webContents.send(IPC_CHANNELS.UPDATER_EVENT_AVAILABLE, info)
    notifyUpdateReady(info.version, getMainWindow)
  })

  autoUpdater.on('update-downloaded', (info) => {
    getMainWindow()?.webContents.send(IPC_CHANNELS.UPDATER_EVENT_DOWNLOADED, info)
  })

  autoUpdater.on('error', (err) => {
    log.error('updater error', err)
  })
}
