import { ipcMain, type BrowserWindow } from 'electron'
import { SLEEP_LOCKDOWN_PROCESS_MARKER } from '@shared/blocking'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import type { Storage } from '@service/storage'
import type {
  DeclaredAppsState,
  DeclaredAppUsageState,
  DiscoveredSitesState,
  ActiveSession,
  Objective,
  Task,
} from '@shared/schemas'
import type { SemanticActiveTask } from '@shared/deepseek'
import { listProcesses } from '@service/blocking/processes/enumerator'
import { evaluateSemanticAccess, evaluateSiteAccessDirect } from '@main/deepseek/gateway'
import {
  closeSiteBlockOverlayWindowsExcept,
  closeSiteBlockOverlayWindow,
  requestSemanticJustificationWindow,
  showBlockOverlayWindow,
} from './strict-block-window'
import { createTracker, type Tracker } from './app-usage-tracker'
import { createSiteTracker, type SiteEvent } from './site-tracker'
import log from '@main/logging/setup'

function localDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number) as [number, number, number]
  return new Date(year, month - 1, day)
}

function daysBetweenLocalDates(fromDateStr: string, toDateStr: string): number {
  const from = parseLocalDate(fromDateStr)
  const to = parseLocalDate(toDateStr)
  return Math.round((to.getTime() - from.getTime()) / 86_400_000)
}

function deadlineMultiplier(task: Task, todayStr: string): number {
  const diffDays = daysBetweenLocalDates(todayStr, task.deadline)
  if (diffDays <= 0) return 0
  if (diffDays === 1) return 2
  if (diffDays <= 3) return 1.6
  if (diffDays <= 7) return 1.3
  return 1
}

function complexityCoefficient(task: Task): number {
  const complexity = task.difficulty ?? task.complexity ?? 'normal'
  if (complexity === 'easy') return 1
  if (complexity === 'normal') return 1.2
  if (complexity === 'hard') return 1.5
  if (complexity === 'manual') return 1
  if (complexity === 'extreme') return 2.4
  return 1.8
}

function progressCoefficient(task: Task): number {
  const estimated = task.estimatedMinutes ?? Math.max(30, task.level * 30)
  const remaining = task.remainingMinutes ?? estimated
  if (estimated <= 0) return 0.3
  const progress = Math.max(0, Math.min(1, (estimated - remaining) / estimated))
  if (progress >= 0.9) return 0.3
  if (progress >= 0.75) return 0.5
  if (progress >= 0.5) return 0.7
  if (progress >= 0.25) return 0.85
  return 1
}

function activeTaskScore(task: Task, todayStr: string): number {
  return (
    task.level *
    deadlineMultiplier(task, todayStr) *
    complexityCoefficient(task) *
    progressCoefficient(task)
  )
}

function domainsFromTask(task: Task, objective: Objective | undefined): string[] {
  const config = task.blocking ?? objective?.blocking
  if (!config || config.mode !== 'allowlist') return []
  return config.sites
}

const EMPTY_APP_USAGE_STATE: DeclaredAppUsageState = {
  entries: [],
  lastTickAt: null,
  activityEvents: [],
}

function parseOptionalUserId(rawUserId: unknown): string | undefined {
  if (rawUserId === undefined) return undefined
  if (typeof rawUserId !== 'string') throw new Error('userId invalide')
  const trimmed = rawUserId.trim()
  return trimmed ? trimmed : undefined
}

async function getActiveTaskContext(
  storage: Storage,
  userId?: string,
): Promise<SemanticActiveTask | null> {
  if (!userId) return null
  const [tasksState, objectivesState] = await Promise.all([
    storage.read('tasks', userId),
    storage.read('objectives', userId),
  ])
  const tasks = tasksState?.tasks ?? []
  const objectives = objectivesState?.objectives ?? []
  const objectiveById = new Map(objectives.map((objective) => [objective.id, objective]))
  const todayStr = localDateKey(new Date())
  const active = tasks
    .filter(
      (task) => task.status === 'active' && task.level > 0 && (task.remainingMinutes ?? 1) > 0,
    )
    .sort((a, b) => {
      const score = activeTaskScore(b, todayStr) - activeTaskScore(a, todayStr)
      if (score !== 0) return score
      return b.level - a.level || a.deadline.localeCompare(b.deadline)
    })[0]
  if (!active) return null
  const objective = active.linkedObjectiveId
    ? objectiveById.get(active.linkedObjectiveId)
    : undefined
  return {
    id: active.id,
    title: active.title,
    objectiveName: objective?.name,
    allowedDomains: domainsFromTask(active, objective),
  }
}

async function persistDetectedSite(
  storage: Storage,
  event: SiteEvent,
  userId?: string,
): Promise<void> {
  if (!userId) return
  const now = new Date().toISOString()
  const state: DiscoveredSitesState = (await storage.read('discovered_sites', userId)) ?? {
    sites: [],
  }
  const existing = state.sites.find((site) => site.domain === event.domain)
  if (existing) {
    existing.lastSeenAt = now
    existing.visitCount += 1
    existing.lastTitle = event.title ?? event.windowTitle
    existing.lastUrl = event.url
    existing.lastMetaDescription = event.metaDescription
    existing.lastMetaKeywords = event.metaKeywords
    existing.semanticStatus = event.semanticStatus ?? existing.semanticStatus
    existing.semanticStatusUntil =
      event.semanticStatus === 'allowed'
        ? new Date(Date.now() + 10 * 60_000).toISOString()
        : existing.semanticStatusUntil
  } else {
    state.sites.push({
      domain: event.domain,
      firstSeenAt: now,
      lastSeenAt: now,
      visitCount: 1,
      blocked: false,
      lastTitle: event.title ?? event.windowTitle,
      lastUrl: event.url,
      lastMetaDescription: event.metaDescription,
      lastMetaKeywords: event.metaKeywords,
      semanticStatus: event.semanticStatus ?? 'unknown',
      semanticStatusUntil:
        event.semanticStatus === 'allowed'
          ? new Date(Date.now() + 10 * 60_000).toISOString()
          : undefined,
    })
  }
  state.sites = state.sites.sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt)).slice(0, 2000)
  await storage.write('discovered_sites', state, userId)
}

function recordBrowserActivity(tracker: Tracker, event: SiteEvent): void {
  tracker.recordActivityEvent({
    at: new Date().toISOString(),
    kind: event.semanticStatus === 'blocked' ? 'distracting-app-active' : 'browser-site',
    label: event.title ?? event.windowTitle,
    domain: event.domain,
  })
}

function domainMatches(domain: string, blockedDomain: string): boolean {
  const clean = domain.replace(/^www\./, '').toLowerCase()
  const blocked = blockedDomain.replace(/^www\./, '').toLowerCase()
  return clean === blocked || clean.endsWith(`.${blocked}`)
}

function isSleepLockdownSession(session: ActiveSession): boolean {
  return session.profileSnapshot.blockedProcesses
    .map((processName) => processName.toLowerCase())
    .includes(SLEEP_LOCKDOWN_PROCESS_MARKER)
}

import { isSafeListed } from '@service/blocking/processes/safe-list'

const BROWSER_PROCESSES = new Set([
  'arc.exe',
  'brave.exe',
  'browser.exe',
  'chrome.exe',
  'chromium.exe',
  'comet.exe',
  'duckduckgo.exe',
  'firefox.exe',
  'googlechrome.exe',
  'iexplore.exe',
  'msedge.exe',
  'opera.exe',
  'opera_gx.exe',
  'perplexity.exe',
  'thorium.exe',
  'vivaldi.exe',
])

function isUserFacingProcessName(name: string): boolean {
  const lower = name.toLowerCase().trim()
  if (!lower.endsWith('.exe')) return false
  if (isSafeListed(lower)) return false
  if (BROWSER_PROCESSES.has(lower)) return false

  // Exclude common background services/processes that are not user apps
  if (
    lower.includes('helper') ||
    lower.includes('service') ||
    lower.includes('host') ||
    lower.includes('update') ||
    lower.includes('setup') ||
    lower.includes('install') ||
    lower.includes('daemon') ||
    lower.includes('agent') ||
    lower.includes('crash') ||
    lower.includes('telemetry')
  ) {
    return false
  }

  return true
}

function getAppDisplayName(exeName: string): string {
  const base = exeName.replace(/\.exe$/i, '')
  return base.charAt(0).toUpperCase() + base.slice(1)
}

function getDomainDisplayName(domain: string): string {
  const parts = domain.split('.')
  const namePart = parts.length >= 2 ? parts[parts.length - 2] : parts[0]
  if (!namePart) return domain
  return namePart.charAt(0).toUpperCase() + namePart.slice(1)
}

export async function registerAppUsageHandlers(
  storage: Storage,
  getMainWindow: () => BrowserWindow | null,
  getCurrentUserId: () => string | undefined,
  getActiveBlockingSession: () => ActiveSession | null,
): Promise<{
  tracker: Tracker
  beforeUserChange: () => Promise<void>
  afterUserChange: () => Promise<void>
}> {
  const tracker = createTracker({
    storage: {
      read: () => {
        const userId = getCurrentUserId()
        return userId ? storage.read('declared_app_usage', userId) : Promise.resolve(null)
      },
      write: (state: DeclaredAppUsageState) => {
        const userId = getCurrentUserId()
        return userId ? storage.write('declared_app_usage', state, userId) : Promise.resolve()
      },
    },
    getDeclaredApps: async () => {
      const userId = getCurrentUserId()
      if (!userId) return []
      const declared = (await storage.read('declared_apps', userId)) as DeclaredAppsState | null
      return declared?.apps ?? []
    },
    listProcesses: async () => {
      const processes = await listProcesses()
      const userId = getCurrentUserId()
      if (userId) {
        const win = getMainWindow()
        if (win && !win.isDestroyed()) {
          for (const proc of processes) {
            const exeName = proc.name.toLowerCase()
            if (isUserFacingProcessName(exeName)) {
              win.webContents.send(IPC_CHANNELS.REGISTRY_EVENT_ITEM_OBSERVED, {
                kind: 'app',
                identifier: exeName,
                displayName: getAppDisplayName(exeName),
              })
            }
          }
        }
      }
      return processes
    },
    onFlush: (state) => {
      const win = getMainWindow()
      if (win && !win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.APP_USAGE_EVENT_TICK, state)
      }
    },
  })

  await tracker.hydrate()

  ipcMain.handle(IPC_CHANNELS.APP_USAGE_GET, async (_e, rawUserId: unknown) => {
    const requestedUserId = parseOptionalUserId(rawUserId) ?? getCurrentUserId()
    if (!requestedUserId) return EMPTY_APP_USAGE_STATE
    if (requestedUserId === getCurrentUserId()) return tracker.getState()
    return (await storage.read('declared_app_usage', requestedUserId)) ?? EMPTY_APP_USAGE_STATE
  })

  // Démarre le tick (60s) + flush (30s)
  tracker.start()

  function readActiveBlockingSession(): ActiveSession | null {
    return getActiveBlockingSession()
  }

  let siteOverlayQueue: Promise<void> = Promise.resolve()
  const siteTracker = createSiteTracker({
    scanHistoryEnabled: true,
    getActiveTask: async () => {
      const userId = getCurrentUserId()
      if (!readActiveBlockingSession()) return null
      return getActiveTaskContext(storage, userId)
    },
    hasActiveSession: async () => {
      return readActiveBlockingSession() !== null
    },
    evaluateSemanticAccess,
    evaluateSiteAccessDirect,
    requestJustification: ({ metadata, activeTask }) =>
      requestSemanticJustificationWindow({
        domain: metadata.domain,
        title: metadata.title,
        taskTitle: activeTask.title,
      }),
    onStrictBlock: ({ metadata, activeTask }) => {
      showBlockOverlayWindow({ targetName: metadata.domain, type: 'site', mode: 'work' })
    },
    onVisibleBrowserWindows: (windowIds) => {
      closeSiteBlockOverlayWindowsExcept(windowIds)
    },
    onActiveBrowserWindow: (browser) => {
      // Fermeture immédiate (hors queue) : si le domaine n'est pas bloqué ou
      // qu'il n'y a pas de session active, on n'attend pas les opérations
      // précédentes — l'overlay doit disparaître dès que l'utilisateur
      // navigue vers un onglet autorisé.
      const active = readActiveBlockingSession()
      if (!active || !browser.domain) {
        closeSiteBlockOverlayWindow(browser.windowId)
        return
      }
      const blocked = active.profileSnapshot.blockedSites.some((domain) =>
        domainMatches(browser.domain ?? '', domain),
      )
      if (!blocked) {
        closeSiteBlockOverlayWindow(browser.windowId)
        return
      }

      // L'onglet actif est bloqué → afficher/maintenir l'overlay.
      // On passe par la queue uniquement pour l'ouverture, afin d'éviter
      // les créations simultanées de plusieurs fenêtres overlay.
      siteOverlayQueue = siteOverlayQueue
        .catch(() => undefined)
        .then(() => {
          // Re-vérifier après la queue : l'utilisateur a pu naviguer entre temps.
          const currentActive = readActiveBlockingSession()
          if (!currentActive || !browser.domain) {
            closeSiteBlockOverlayWindow(browser.windowId)
            return
          }
          const stillBlocked = currentActive.profileSnapshot.blockedSites.some((domain) =>
            domainMatches(browser.domain ?? '', domain),
          )
          if (!stillBlocked) {
            closeSiteBlockOverlayWindow(browser.windowId)
            return
          }
          showBlockOverlayWindow({
            targetName: browser.domain,
            type: 'site',
            mode: isSleepLockdownSession(currentActive) ? 'sleep' : 'work',
            pid: browser.pid,
            windowId: browser.windowId,
            focusLabel: currentActive.profileSnapshot.name,
          })
        })
        .catch((err) => {
          log.warn('[site-overlay] synchronisation échouée', err)
        })
    },
  })
  let siteWriteQueue: Promise<void> = Promise.resolve()
  const siteBlockCooldowns = new Map<string, number>()
  siteTracker.on('site-detected', (event) => {
    siteWriteQueue = siteWriteQueue
      .catch(() => undefined)
      .then(async () => {
        const userId = getCurrentUserId()
        const isHistory = event.windowTitle === 'Historique navigateur'
        if (!isHistory && !readActiveBlockingSession()) return
        await persistDetectedSite(storage, event, userId)
        recordBrowserActivity(tracker, event)

        // Envoie de l'événement d'observation de site au renderer
        const win = getMainWindow()
        if (win && !win.isDestroyed()) {
          win.webContents.send(IPC_CHANNELS.REGISTRY_EVENT_ITEM_OBSERVED, {
            kind: 'site',
            identifier: event.domain,
            displayName: getDomainDisplayName(event.domain),
          })
        }

        const active = readActiveBlockingSession()
        if (!active) return
        const blocked = active.profileSnapshot.blockedSites.some((domain) =>
          domainMatches(event.domain, domain),
        )
        if (!blocked) return
        const key = `${active.id}|${event.domain}`
        if ((siteBlockCooldowns.get(key) ?? 0) > Date.now()) return
        siteBlockCooldowns.set(key, Date.now() + 3_000)
        if (isSleepLockdownSession(active)) {
          showBlockOverlayWindow({
            targetName: event.domain,
            type: 'site',
            mode: 'sleep',
            ...(event.pid && event.windowId ? { pid: event.pid, windowId: event.windowId } : {}),
            focusLabel: active.profileSnapshot.name,
          })
        } else {
          showBlockOverlayWindow({
            targetName: event.domain,
            type: 'site',
            mode: 'work',
            ...(event.pid && event.windowId ? { pid: event.pid, windowId: event.windowId } : {}),
            focusLabel: active.profileSnapshot.name,
          })
        }
      })
      .catch((err) => {
        log.warn('browser history site persist failed', err)
      })
  })
  siteTracker.start()

  return {
    tracker,
    async beforeUserChange() {
      await tracker.flushNow()
      tracker.clear()
    },
    async afterUserChange() {
      tracker.clear()
      await tracker.hydrate()
      const win = getMainWindow()
      if (win && !win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.APP_USAGE_EVENT_TICK, tracker.getState())
      }
    },
  }
}
