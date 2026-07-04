import { app, type BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import type { UpdaterCheckResult } from '@shared/updater'
import log from '@main/logging/setup'
import { notifyUpdateReady } from '../notifications'

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000
const STARTUP_GRACE_MS = 60_000

let started = false
let pendingCheck: Promise<UpdaterCheckResult> | null = null

function currentVersion(): string {
  return app.getVersion()
}

export function checkForUpdatesNow(
  isSessionActive: () => boolean = () => false,
): Promise<UpdaterCheckResult> {
  if (!app.isPackaged) {
    return Promise.resolve({
      status: 'disabled',
      currentVersion: currentVersion(),
      message: "La vérification des mises à jour est active seulement dans l'app packagée.",
    })
  }

  if (isSessionActive()) {
    return Promise.resolve({
      status: 'skipped',
      currentVersion: currentVersion(),
      reason: 'focus-session-active',
      message: 'Vérification ignorée pendant une session de focus active.',
    })
  }

  if (pendingCheck) return pendingCheck

  pendingCheck = autoUpdater
    .checkForUpdates()
    .then((result): UpdaterCheckResult => {
      const latestVersion = result?.updateInfo?.version
      if (latestVersion && latestVersion !== currentVersion()) {
        return {
          status: 'available',
          currentVersion: currentVersion(),
          version: latestVersion,
        }
      }
      return {
        status: 'not-available',
        currentVersion: currentVersion(),
        version: latestVersion,
      }
    })
    .catch((err): UpdaterCheckResult => {
      const message = err instanceof Error ? err.message : String(err)
      log.warn('updater check failed', err)
      return {
        status: 'error',
        currentVersion: currentVersion(),
        message,
      }
    })
    .finally(() => {
      pendingCheck = null
    })

  return pendingCheck
}

export function startUpdater(
  getMainWindow: () => BrowserWindow | null,
  isSessionActive: () => boolean = () => false,
): void {
  if (started || !app.isPackaged) return
  started = true

  autoUpdater.logger = log
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  const check = (): void => {
    void checkForUpdatesNow(isSessionActive).then((result) => {
      if (result.status === 'skipped') {
        log.info('updater check skipped while a focus session is active')
      }
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
    const sessionActive = isSessionActive()
    if (sessionActive) {
      autoUpdater.autoInstallOnAppQuit = false
      log.info('updater skipRestart: active focus session')
    } else {
      autoUpdater.autoInstallOnAppQuit = true
    }
    getMainWindow()?.webContents.send(IPC_CHANNELS.UPDATER_EVENT_DOWNLOADED, info)
  })

  autoUpdater.on('error', (err) => {
    log.error('updater error', err)
  })
}
