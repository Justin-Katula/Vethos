import { ipcMain, type BrowserWindow } from 'electron'
import { promises as fsp } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import { BlockingProfileSchema } from '@shared/schemas'
import type { Storage } from '@main/storage'
import { createSessionManager } from '@service/blocking/session/manager'
import { createDriftDetector } from '@service/blocking/session/drift-detector'
import { createFirewallTracker } from '@service/blocking/firewall/rule-tracker'
import { listRuleNames } from '@service/blocking/firewall/netsh'
import { applyNexusBlock, clearNexusBlock } from '@service/blocking/hosts/writer'
import { HOSTS_PATH } from '@service/blocking/hosts/writer'
import { parseHostsFile } from '@service/blocking/hosts/parser'
import { flushDns } from '@service/blocking/hosts/flush-dns'
import { createBlockingPersistence } from '../session/persistence'
import { isElevated, requestElevatedRelaunch } from '../elevation'
import { isSafeListed } from '@service/blocking/processes/safe-list'
import { startProcessKiller } from '@service/blocking/processes/killer'
import { getWindowsEdition, pickBlockingStrategy, startAppLockerBlocker } from '@service/blocking/applocker/policy'
import { evaluateSessionRules } from '@service/blocking/session/rules'
import {
  notifyBreakRequired,
  notifyClockTamper,
  notifyServiceNotStarted,
  notifySessionEnd,
  notifySessionStart,
} from '../../notifications'
import { startClockMonitor } from '@service/blocking/session/clock-monitor'
import log from '@main/logging/setup'
import { getPreviousFreeMinutesByDate } from '@main/free-time/recalculate'

export async function registerBlockingHandlers(
  storage: Storage,
  getMainWindow: () => BrowserWindow | null,
): Promise<{ isSessionActive: () => boolean }> {
  const persistence = createBlockingPersistence(storage)
  const firewall = createFirewallTracker()
  const elevatedAtBoot = await isElevated()
  const windowsEdition = getWindowsEdition()
  const settings = await storage.read('settings')
  let currentStrictBlocking = settings?.strictBlocking !== false
  let processLayerStatus: 'inactive' | 'ok' | 'error' = 'inactive'
  let liveRuleNotifiedFor: string | null = null
  const manager = createSessionManager({
    hosts: { apply: applyNexusBlock, clear: clearNexusBlock, flushDns },
    processes: {
      start: (forbidden) => {
        if (forbidden.length === 0) {
          processLayerStatus = 'inactive'
          return { stop: () => undefined }
        }

        const strategy = pickBlockingStrategy({
          elevated: elevatedAtBoot,
          strictBlocking: currentStrictBlocking,
          edition: windowsEdition,
        })
        if (strategy.processLayer !== 'applocker') {
          processLayerStatus = 'ok'
          log.warn('[blocking] AppLocker unavailable, falling back to process kill', strategy.reason)
          const killer = startProcessKiller(forbidden)
          return {
            stop: () => {
              killer.stop()
              processLayerStatus = 'inactive'
            },
          }
        }

        const appLocker = startAppLockerBlocker(forbidden, strategy.appLockerMode)
        if (appLocker.applied) {
          processLayerStatus = 'ok'
          return {
            stop: () => {
              appLocker.stop()
              processLayerStatus = 'inactive'
            },
          }
        }

        processLayerStatus = 'error'
        log.warn('[blocking] AppLocker unavailable', appLocker.error)
        notifyServiceNotStarted('AppLocker', getMainWindow)
        const killer = startProcessKiller(forbidden)
        if (forbidden.length === 0) return { stop: () => undefined }
        processLayerStatus = 'ok'
        return {
          stop: () => {
            killer.stop()
            processLayerStatus = 'inactive'
          },
        }
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
    if (!s) liveRuleNotifiedFor = null
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

  setInterval(async () => {
    const active = manager.getActive()
    if (!active || liveRuleNotifiedFor === active.id) return

    const latestSettings = await storage.read('settings')
    if (latestSettings?.sessionRulesEnabled === false) return

    const state = await persistence.readState()
    const elapsedMinutes = Math.max(
      0,
      Math.ceil((Date.now() - new Date(active.startedAt).getTime()) / 60_000),
    )
    const decision = evaluateSessionRules({
      history: state.history,
      profileId: active.profileId,
      requestedMinutes: elapsedMinutes,
    })
    if (decision.ok) return

    liveRuleNotifiedFor = active.id
    getMainWindow()?.webContents.send(IPC_CHANNELS.BLOCKING_EVENT_BREAK_REQUIRED, {
      reason: decision.reason,
      restMinutes: decision.restMinutes,
    })
    notifyBreakRequired(decision.restMinutes, getMainWindow)
  }, 60_000)

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
      currentStrictBlocking = latestSettings?.strictBlocking !== false
      const state = await persistence.readState()
      const penaltyMinutes = state.nextSessionPenaltyMinutes ?? 0
      const durationMinutes = Math.min(24 * 60, args.durationMinutes + penaltyMinutes)
      if (!elevatedAtBoot) {
        throw new Error('Blocage non opérationnel — droits administrateur requis')
      }
      if (latestSettings?.sessionRulesEnabled !== false) {
        const freeMinutesByDate = await getPreviousFreeMinutesByDate(storage).catch((err) => {
          log.warn('[blocking] free-time lookup failed for session rules', err)
          return undefined
        })
        const decision = evaluateSessionRules({
          history: state.history,
          profileId: args.profileId,
          requestedMinutes: durationMinutes,
          freeMinutesByDate,
        })
        if (!decision.ok) {
          notifyBreakRequired(decision.restMinutes, getMainWindow)
          throw new Error(decision.reason)
        }
      }
      const session = await manager.startSession({ ...args, durationMinutes })
      if (penaltyMinutes > 0) {
        const latestState = await persistence.readState()
        await persistence.writeState({ ...latestState, nextSessionPenaltyMinutes: 0 })
      }
      notifySessionStart(session.profileSnapshot.name, durationMinutes, getMainWindow)
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
    let hosts: 'ok' | 'drifted' | 'error' = 'ok'
    let firewallStatus: 'ok' | 'drifted' | 'error' = 'ok'

    try {
      const rawHosts = await fsp.readFile(HOSTS_PATH, 'utf8')
      const parsed = parseHostsFile(rawHosts)
      const expectedEntryCount = active.profileSnapshot.blockedSites.length * 8
      if (
        expectedEntryCount > 0 &&
        (!parsed.nexusBlock || parsed.nexusBlock.entries.length !== expectedEntryCount)
      ) {
        hosts = 'drifted'
      }
    } catch {
      hosts = 'error'
    }

    try {
      const appliedNames = active.appliedFirewallRules
      const existing = new Set(await listRuleNames())
      if (appliedNames.some((name) => !existing.has(name))) {
        firewallStatus = 'drifted'
      }
    } catch {
      firewallStatus = 'error'
    }

    return { hosts, processes: processLayerStatus, firewall: firewallStatus }
  })

  ipcMain.handle(IPC_CHANNELS.BLOCKING_IS_ELEVATED, async () => elevatedAtBoot)
  ipcMain.handle(IPC_CHANNELS.BLOCKING_REQUEST_ELEVATION, async () =>
    requestElevatedRelaunch(),
  )

  return { isSessionActive: () => manager.getActive() !== null }
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
