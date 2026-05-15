import { ipcMain, type BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import { BlockingProfileSchema } from '@shared/schemas'
import type { Storage } from '@main/storage'
import { createSessionManager } from '../session/manager'
import { createDriftDetector } from '../session/drift-detector'
import { createFirewallTracker } from '../firewall/rule-tracker'
import { startProcessWatcher } from '../processes/watcher'
import { applyNexusBlock, clearNexusBlock } from '../hosts/writer'
import { flushDns } from '../hosts/flush-dns'
import { createBlockingPersistence } from '../session/persistence'
import { isElevated, requestElevatedRelaunch } from '../elevation'
import { isSafeListed } from '../processes/safe-list'
import { startAppLockerBlocker } from '../applocker/policy'
import { evaluateSessionRules } from '../session/rules'
import {
  notifyBreakRequired,
  notifyClockTamper,
  notifySessionEnd,
  notifySessionStart,
} from '../../notifications'
import { startClockMonitor } from '../session/clock-monitor'
import log from '@main/logging/setup'

export async function registerBlockingHandlers(
  storage: Storage,
  getMainWindow: () => BrowserWindow | null,
): Promise<void> {
  const persistence = createBlockingPersistence(storage)
  const firewall = createFirewallTracker()
  const elevatedAtBoot = await isElevated()
  const settings = await storage.read('settings')
  const appLockerMode = settings?.strictBlocking === false ? 'AuditOnly' : 'Enabled'
  const manager = createSessionManager({
    hosts: { apply: applyNexusBlock, clear: clearNexusBlock, flushDns },
    processes: {
      start: (forbidden) => {
        if (elevatedAtBoot) {
          const appLocker = startAppLockerBlocker(forbidden, appLockerMode)
          if (appLocker.applied) return { stop: appLocker.stop }
          log.warn(
            '[blocking] AppLocker unavailable, falling back to process watcher',
            appLocker.error,
          )
        }
        return startProcessWatcher(forbidden)
      },
    },
    firewall: {
      applyAll: firewall.applyAll,
      removeAll: firewall.removeAll,
      removeOrphansExcept: firewall.removeOrphansExcept,
      applied: firewall.applied,
    },
    persistence,
  })

  manager.on('sessionChanged', (s) => {
    getMainWindow()?.webContents.send(IPC_CHANNELS.BLOCKING_EVENT_SESSION_CHANGED, s)
  })
  manager.on('sessionEnded', async (entry, session) => {
    const durationMin = Math.max(
      0,
      Math.round((new Date(entry.endedAt).getTime() - new Date(entry.startedAt).getTime()) / 60_000),
    )
    if (entry.completedNormally) {
      notifySessionEnd(session.profileSnapshot.name, durationMin, getMainWindow)
      const stats = await storage.read('stats')
      await storage.write('stats', {
        totalFocusMinutes: (stats?.totalFocusMinutes ?? 0) + durationMin,
        totalSessions: (stats?.totalSessions ?? 0) + 1,
        longestStreak: Math.max(stats?.longestStreak ?? 0, await computeLongestStreak(persistence)),
        lastUpdated: new Date().toISOString(),
      })
    }
  })

  const drift = createDriftDetector()
  drift.on((e) => {
    getMainWindow()?.webContents.send(IPC_CHANNELS.BLOCKING_EVENT_LAYER_DRIFT, e)
  })
  drift.start(
    () => manager.getActive(),
    async (s) => {
      const names = await firewall.applyAll(s.id, s.profileSnapshot.blockedNetworkApps)
      await firewall.removeOrphansExcept(names).catch(() => {})
      s.appliedFirewallRules = names
      await persistence.writeActive(s)
    },
  )

  startClockMonitor((event) => {
    getMainWindow()?.webContents.send(IPC_CHANNELS.BLOCKING_EVENT_CLOCK_TAMPER, {
      driftMs: event.driftMs,
    })
    notifyClockTamper(event.driftMs, getMainWindow)
  })

  await manager.hydrateFromDisk().catch((err) => {
    log.error('[blocking] hydrate failed', err)
  })

  ipcMain.handle(IPC_CHANNELS.BLOCKING_GET_INITIAL_STATE, async () => {
    const state = await persistence.readState()
    return { state, active: manager.getActive() }
  })

  ipcMain.handle(IPC_CHANNELS.BLOCKING_SAVE_PROFILE, async (_e, draft: unknown) => {
    const merged = {
      ...(draft as object),
      id: (draft as { id?: string }).id ?? randomUUID(),
      createdAt: (draft as { createdAt?: string }).createdAt ?? new Date().toISOString(),
    }
    const profile = BlockingProfileSchema.parse(merged)
    for (const exeName of profile.blockedProcesses) {
      if (isSafeListed(exeName)) {
        throw new Error(`System process refused: ${exeName}`)
      }
    }
    const state = await persistence.readState()
    const idx = state.profiles.findIndex((p) => p.id === profile.id)
    if (idx >= 0) state.profiles[idx] = profile
    else state.profiles.push(profile)
    await persistence.writeState(state)
    return profile
  })

  ipcMain.handle(IPC_CHANNELS.BLOCKING_DELETE_PROFILE, async (_e, id: string) => {
    const state = await persistence.readState()
    state.profiles = state.profiles.filter((p) => p.id !== id)
    await persistence.writeState(state)
  })

  ipcMain.handle(
    IPC_CHANNELS.BLOCKING_START_SESSION,
    async (_e, args: { profileId: string; durationMinutes: number }) => {
      const latestSettings = await storage.read('settings')
      if (!elevatedAtBoot) {
        throw new Error('Blocage non opérationnel — droits administrateur requis')
      }
      if (latestSettings?.sessionRulesEnabled !== false) {
        const state = await persistence.readState()
        const decision = evaluateSessionRules({
          history: state.history,
          profileId: args.profileId,
          requestedMinutes: args.durationMinutes,
        })
        if (!decision.ok) {
          notifyBreakRequired(decision.restMinutes, getMainWindow)
          throw new Error(decision.reason)
        }
      }
      const session = await manager.startSession(args)
      notifySessionStart(session.profileSnapshot.name, args.durationMinutes, getMainWindow)
      return session
    },
  )

  ipcMain.handle(IPC_CHANNELS.BLOCKING_REQUEST_UNLOCK, async () => manager.requestUnlock())

  ipcMain.handle(IPC_CHANNELS.BLOCKING_SUBMIT_JUSTIFICATION, async (_e, text: string) =>
    manager.submitJustification(text),
  )

  ipcMain.handle(IPC_CHANNELS.BLOCKING_GET_LAYER_STATUS, async () => {
    const active = manager.getActive()
    if (!active) return { hosts: 'inactive', processes: 'inactive', firewall: 'inactive' }
    return { hosts: 'ok', processes: 'ok', firewall: 'ok' }
  })

  ipcMain.handle(IPC_CHANNELS.BLOCKING_IS_ELEVATED, async () => elevatedAtBoot)
  ipcMain.handle(IPC_CHANNELS.BLOCKING_REQUEST_ELEVATION, async () =>
    requestElevatedRelaunch(),
  )
}

async function computeLongestStreak(persistence: ReturnType<typeof createBlockingPersistence>): Promise<number> {
  const state = await persistence.readState()
  const days = [
    ...new Set(
      state.history
        .filter((entry) => entry.completedNormally)
        .map((entry) => {
          const date = new Date(entry.endedAt)
          return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
        }),
    ),
  ].sort((a, b) => a - b)

  let longest = 0
  let current = 0
  let prev: number | null = null
  for (const day of days) {
    current = prev !== null && day - prev === 86_400_000 ? current + 1 : 1
    longest = Math.max(longest, current)
    prev = day
  }
  return longest
}
