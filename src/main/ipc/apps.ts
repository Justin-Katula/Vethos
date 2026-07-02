import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import {
  discoverInstalledApps,
  type DiscoveredApp,
} from '@main/tracking/app-discovery'

const INSTALLED_APPS_CACHE_TTL_MS = 10 * 60 * 1000

let cachedApps: { apps: DiscoveredApp[]; scannedAt: number } | null = null
let pendingScan: Promise<DiscoveredApp[]> | null = null

export async function getInstalledApps(options: { forceRefresh?: boolean } = {}): Promise<DiscoveredApp[]> {
  const now = Date.now()
  if (
    !options.forceRefresh &&
    cachedApps &&
    now - cachedApps.scannedAt < INSTALLED_APPS_CACHE_TTL_MS
  ) {
    return cachedApps.apps
  }

  if (!options.forceRefresh && pendingScan) return pendingScan

  pendingScan = discoverInstalledApps()
    .then((apps) => {
      cachedApps = { apps, scannedAt: Date.now() }
      return apps
    })
    .finally(() => {
      pendingScan = null
    })

  return pendingScan
}

export function registerAppsHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.APP_DISCOVERY_LIST,
    (_event, options?: { forceRefresh?: boolean }) =>
      getInstalledApps({ forceRefresh: options?.forceRefresh === true }),
  )
}
