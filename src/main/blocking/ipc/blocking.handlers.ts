import { ipcMain, type BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import type { ServiceEvent } from '@shared/service-protocol'
import type { ActiveSession, BlockingHistoryEntry } from '@shared/schemas'
import type { Storage } from '@service/storage'
import { createServiceClient } from '../../service-client/client'
import { getServiceStatus, type ServiceStatus } from '../../service-client/service-status'
import { requestServiceInstall } from '../../elevated-install'
import { computeLongestStreak } from '../streak'
import {
  notifyBreakRequired,
  notifyClockTamper,
  notifyServiceDown,
  notifySessionEnd,
  notifySessionStart,
} from '../../notifications'
import log from '@main/logging/setup'

/**
 * Relais de blocage : le blocage tourne dans le service Windows (cf. Lot 3).
 * Le `main` ne fait plus aucun blocage — il relaie les appels IPC `BLOCKING_*`
 * du renderer vers le service via le named pipe, et re-diffuse au renderer les
 * événements du service. Réf. spec §4.1, §6.
 */
export async function registerBlockingHandlers(
  storage: Storage,
  getMainWindow: () => BrowserWindow | null,
): Promise<{ isSessionActive: () => boolean }> {
  let lastServiceStatus: ServiceStatus | null = null

  function emitServiceStatus(status: ServiceStatus): void {
    if (lastServiceStatus === status) return
    const previousStatus = lastServiceStatus
    lastServiceStatus = status
    getMainWindow()?.webContents.send(IPC_CHANNELS.BLOCKING_EVENT_SERVICE_STATUS, status)
    if (status === 'unavailable' && previousStatus !== 'unavailable') {
      notifyServiceDown(getMainWindow)
    }
  }

  const client = createServiceClient({
    onStatusChange: (connected) => {
      emitServiceStatus(connected ? 'ok' : 'unavailable')
    },
  })
  let sessionActive = false

  // ── Commandes renderer → service ─────────────────────────────────────────

  ipcMain.handle(IPC_CHANNELS.BLOCKING_GET_INITIAL_STATE, () => client.request('GET_STATE'))

  ipcMain.handle(IPC_CHANNELS.BLOCKING_SAVE_PROFILE, (_e, draft: unknown) =>
    client.request('SAVE_PROFILE', draft),
  )

  ipcMain.handle(IPC_CHANNELS.BLOCKING_DELETE_PROFILE, (_e, id: string) =>
    client.request('DELETE_PROFILE', { id }),
  )

  ipcMain.handle(
    IPC_CHANNELS.BLOCKING_START_SESSION,
    async (_e, args: { profileId: string; durationMinutes: number }) => {
      // strictBlocking / sessionRulesEnabled vivent dans settings (côté UI) ;
      // le service en a besoin → on enrichit le payload (spec §4.3).
      const settings = await storage.read('settings')
      const session = (await client.request('START_SESSION', {
        profileId: args.profileId,
        durationMinutes: args.durationMinutes,
        sessionRulesEnabled: settings?.sessionRulesEnabled !== false,
        strictBlocking: settings?.strictBlocking !== false,
      })) as ActiveSession
      notifySessionStart(
        session.profileSnapshot.name,
        session.durationMinutes ?? args.durationMinutes,
        getMainWindow,
      )
      return session
    },
  )

  ipcMain.handle(IPC_CHANNELS.BLOCKING_REQUEST_UNLOCK, () => client.request('REQUEST_UNLOCK'))

  ipcMain.handle(IPC_CHANNELS.BLOCKING_SUBMIT_JUSTIFICATION, (_e, text: string) =>
    client.request('SUBMIT_JUSTIFICATION', { text }),
  )

  ipcMain.handle(IPC_CHANNELS.BLOCKING_GET_LAYER_STATUS, () => client.request('GET_LAYER_STATUS'))

  ipcMain.handle(IPC_CHANNELS.BLOCKING_GET_SERVICE_STATUS, () => getServiceStatus())
  ipcMain.handle(IPC_CHANNELS.BLOCKING_REPAIR_SERVICE, async () => {
    const launched = await requestServiceInstall()
    const status = await getServiceStatus()
    emitServiceStatus(status)
    return launched
  })

  // ── Événements service → renderer ────────────────────────────────────────

  async function handleSessionEnded(payload: {
    entry: BlockingHistoryEntry
    session: ActiveSession
  }): Promise<void> {
    // Défensif : SESSION_CHANGED(null) a normalement déjà remis sessionActive
    // à false, mais on ne dépend pas de l'ordre d'arrivée des événements.
    sessionActive = false
    const { entry, session } = payload
    if (!entry.completedNormally) return
    const durationMin = Math.max(
      0,
      Math.round(
        (new Date(entry.endedAt).getTime() - new Date(entry.startedAt).getTime()) / 60_000,
      ),
    )
    notifySessionEnd(session.profileSnapshot.name, durationMin, getMainWindow)
    // Cycle lecture-écriture de stats non sérialisé entre événements : en
    // pratique les sessions se terminent une à une, donc sans course.
    const { state } = (await client.request('GET_STATE')) as {
      state: { history: BlockingHistoryEntry[] }
    }
    const stats = await storage.read('stats')
    await storage.write('stats', {
      totalFocusMinutes: (stats?.totalFocusMinutes ?? 0) + durationMin,
      totalSessions: (stats?.totalSessions ?? 0) + 1,
      longestStreak: Math.max(stats?.longestStreak ?? 0, computeLongestStreak(state.history ?? [])),
      lastUpdated: new Date().toISOString(),
    })
  }

  async function handleServiceEvent(event: ServiceEvent): Promise<void> {
    const win = getMainWindow()
    switch (event.type) {
      case 'SESSION_CHANGED':
        // Le service émet SESSION_CHANGED(null) avant SESSION_ENDED en fin de session.
        sessionActive = event.payload !== null
        win?.webContents.send(IPC_CHANNELS.BLOCKING_EVENT_SESSION_CHANGED, event.payload)
        return
      case 'SESSION_ENDED':
        await handleSessionEnded(
          event.payload as { entry: BlockingHistoryEntry; session: ActiveSession },
        )
        return
      case 'LAYER_DRIFT':
        win?.webContents.send(IPC_CHANNELS.BLOCKING_EVENT_LAYER_DRIFT, event.payload)
        return
      case 'CLOCK_TAMPER': {
        const payload = event.payload as { driftMs: number }
        win?.webContents.send(IPC_CHANNELS.BLOCKING_EVENT_CLOCK_TAMPER, payload)
        notifyClockTamper(payload.driftMs, getMainWindow)
        return
      }
      case 'BREAK_REQUIRED': {
        const payload = event.payload as { reason: string; restMinutes: number }
        win?.webContents.send(IPC_CHANNELS.BLOCKING_EVENT_BREAK_REQUIRED, payload)
        notifyBreakRequired(payload.restMinutes, getMainWindow)
        return
      }
      default:
        log.warn('[blocking-relay] événement service inconnu', event.type)
        return
    }
  }

  // `.catch` obligatoire : `onEvent` est fire-and-forget ; une rejection non
  // capturée déclencherait le `unhandledRejection` global du main (app.exit).
  client.onEvent((event) => {
    handleServiceEvent(event).catch((err) => {
      log.error('[blocking-relay] échec du traitement d un événement service', err)
    })
  })

  return { isSessionActive: () => sessionActive }
}
