import { ipcMain, type BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import type { Storage } from '@service/storage'
import type {
  DeclaredAppsState,
  DeclaredAppUsageState,
  DiscoveredSitesState,
} from '@shared/schemas'
import { listProcesses } from '@service/blocking/processes/enumerator'
import { createTracker, type Tracker } from './app-usage-tracker'
import { createSiteTracker } from './site-tracker'
import log from '@main/logging/setup'

async function persistDetectedSite(storage: Storage, domain: string): Promise<void> {
  const now = new Date().toISOString()
  const state: DiscoveredSitesState =
    (await storage.read('discovered_sites')) ?? { sites: [] }
  const existing = state.sites.find((site) => site.domain === domain)
  if (existing) {
    existing.lastSeenAt = now
    existing.visitCount += 1
  } else {
    state.sites.push({
      domain,
      firstSeenAt: now,
      lastSeenAt: now,
      visitCount: 1,
      blocked: false,
    })
  }
  state.sites = state.sites
    .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
    .slice(0, 2000)
  await storage.write('discovered_sites', state)
}

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

  const siteTracker = createSiteTracker()
  let siteWriteQueue: Promise<void> = Promise.resolve()
  siteTracker.on('site-detected', ({ domain }) => {
    siteWriteQueue = siteWriteQueue
      .catch(() => undefined)
      .then(() => persistDetectedSite(storage, domain))
      .catch((err) => {
        log.warn('browser history site persist failed', err)
      })
  })
  const settings = await storage.read('settings')
  if (settings?.browserHistoryScanEnabled) {
    siteTracker.start()
  } else {
    log.info('browser history scanner disabled until explicit opt-in')
  }

  return tracker
}
