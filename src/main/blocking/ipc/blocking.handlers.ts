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
import { isElevated } from '../elevation'
import { isSafeListed } from '../processes/safe-list'

export async function registerBlockingHandlers(
  storage: Storage,
  getMainWindow: () => BrowserWindow | null,
): Promise<void> {
  const persistence = createBlockingPersistence(storage)
  const firewall = createFirewallTracker()
  const manager = createSessionManager({
    hosts: { apply: applyNexusBlock, clear: clearNexusBlock, flushDns },
    processes: { start: startProcessWatcher },
    firewall: {
      applyAll: firewall.applyAll,
      removeAll: firewall.removeAll,
      applied: firewall.applied,
    },
    persistence,
  })

  manager.on('sessionChanged', (s) => {
    getMainWindow()?.webContents.send(IPC_CHANNELS.BLOCKING_EVENT_SESSION_CHANGED, s)
  })

  const drift = createDriftDetector()
  drift.on((e) => {
    getMainWindow()?.webContents.send(IPC_CHANNELS.BLOCKING_EVENT_LAYER_DRIFT, e)
  })
  drift.start(
    () => manager.getActive(),
    async (s) => {
      await firewall.removeAll().catch(() => {})
      const names = await firewall.applyAll(s.id, s.profileSnapshot.blockedNetworkApps)
      s.appliedFirewallRules = names
      await persistence.writeActive(s)
    },
  )

  await manager.hydrateFromDisk().catch((err) => {
    console.error('[blocking] hydrate failed', err)
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
      return manager.startSession(args)
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

  ipcMain.handle(IPC_CHANNELS.BLOCKING_IS_ELEVATED, async () => isElevated())
}
