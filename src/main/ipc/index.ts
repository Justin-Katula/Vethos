import { ipcMain, app, shell, type BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import type { Storage } from '@service/storage'
import log, { getLogFilePath } from '@main/logging/setup'
import { notifyTaskEvent, type TaskNotifyEvent } from '@main/notifications'
import { checkForUpdatesNow } from '@main/updater/setup'
import { registerStorageHandlers } from './storage.handlers'
import { registerDeepSeekHandlers } from './deepseek.handlers'
import { registerCoachHandlers } from './coach.handlers'
import { registerAppsHandlers } from './apps'
import { registerBlockingHandlers } from '../blocking/ipc/blocking.handlers'
import { registerAppUsageHandlers } from '../tracking/handlers'

export async function registerAllIpcHandlers(
  storage: Storage,
  getMainWindow: () => BrowserWindow | null,
  options: { isDevelopment?: boolean } = {},
): Promise<{ isSessionActive: () => boolean }> {
  let currentUserId: string | undefined
  let appUsageRuntime: Awaited<ReturnType<typeof registerAppUsageHandlers>> | undefined
  let blockingRuntime: Awaited<ReturnType<typeof registerBlockingHandlers>> | undefined

  function parseOptionalUserId(rawUserId: unknown): string | undefined {
    if (rawUserId === undefined) return undefined
    if (typeof rawUserId !== 'string') {
      throw new Error('userId invalide')
    }
    const trimmed = rawUserId.trim()
    return trimmed ? trimmed : undefined
  }

  registerStorageHandlers(storage, () => currentUserId)
  registerDeepSeekHandlers()
  registerCoachHandlers()

  ipcMain.handle(IPC_CHANNELS.APP_GET_VERSION, () => app.getVersion())
  ipcMain.handle(IPC_CHANNELS.AUTH_SET_USER_ID, async (_e, rawUserId: unknown) => {
    const nextUserId = parseOptionalUserId(rawUserId)
    if (currentUserId === nextUserId) return
    const previousUserId = currentUserId
    await appUsageRuntime?.beforeUserChange()
    if (previousUserId && previousUserId !== nextUserId && blockingRuntime) {
      await blockingRuntime.setUserId(undefined).catch((err) => {
        log.warn('[ipc] nettoyage service au changement utilisateur échoué', err)
      })
    }
    currentUserId = nextUserId
    if (blockingRuntime) {
      await blockingRuntime.setUserId(nextUserId).catch((err) => {
        log.warn('[ipc] synchronisation utilisateur service échouée', err)
      })
    }
    await appUsageRuntime?.afterUserChange()
  })
  ipcMain.handle(IPC_CHANNELS.APP_OPEN_LOGS, async () => {
    await shell.openPath(getLogFilePath())
  })
  registerAppsHandlers()

  // V2 P9 — Notifications de niveau des tâches déclenchées depuis le
  // renderer (tasks.store). Le main reçoit l'event et déclenche la notif
  // native Windows correspondante.
  ipcMain.handle(IPC_CHANNELS.TASKS_NOTIFY, (_e, event: TaskNotifyEvent) => {
    notifyTaskEvent(event, getMainWindow)
  })

  blockingRuntime = await registerBlockingHandlers(storage, getMainWindow, {
    allowServiceRepair: !options.isDevelopment,
    servicePipePath: options.isDevelopment ? '\\\\.\\pipe\\VethosDevServiceBridge' : undefined,
    getCurrentUserId: () => currentUserId,
  })
  ipcMain.handle(IPC_CHANNELS.UPDATER_CHECK_NOW, () =>
    checkForUpdatesNow(blockingRuntime.isSessionActive),
  )
  appUsageRuntime = await registerAppUsageHandlers(
    storage,
    getMainWindow,
    () => currentUserId,
    () => blockingRuntime?.getActiveSession() ?? null,
  )
  return blockingRuntime
}
