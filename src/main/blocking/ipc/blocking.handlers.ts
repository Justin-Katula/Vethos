import { ipcMain, type BrowserWindow, shell } from 'electron'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import type { BlockedAttemptPayload } from '@shared/blocking'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import type { ServiceEvent } from '@shared/service-protocol'
import type {
  ActiveSession,
  AppBlockExplanation,
  BlockingHistoryEntry,
  BlockingProfile,
  BlockingState,
  DiscoveredSite,
} from '@shared/schemas'
import type { Storage } from '@service/storage'
import { discoverInstalledApps } from '../../tracking/app-discovery'
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
import {
  closeBlockOverlayWindow,
  permitBlockOverlayClose,
  restoreBlockedAppResources,
  showBlockOverlayWindow,
  showRecoveryBreakWindow,
} from '../../tracking/strict-block-window'
import {
  evaluateAppExplanation,
  type AppExplanationFocus,
} from '../app-explanation-coach'
import log from '@main/logging/setup'

const DOMAIN_RE = /^(?!-)[a-zA-Z0-9-]{1,63}(?<!-)(\.[a-zA-Z]{2,})+$/
const MAX_APP_EXPLANATION_HISTORY = 1000
const TEST_BLOCKING_PROFILE_ID = '00000000-0000-4000-8000-000000000099'
const TEST_BLOCKING_DURATION_MINUTES = 5

const SAFE_PROCESS_NAMES = new Set([
  'applicationframehost.exe',
  'audiodg.exe',
  'conhost.exe',
  'csrss.exe',
  'ctfmon.exe',
  'dwm.exe',
  'electron.exe',
  'explorer.exe',
  'nexus.exe',
  'nexusblockingservice.exe',
  'vethos.exe',
  'vethosblockingservice.exe',
  'runtimebroker.exe',
  'searchhost.exe',
  'shellexperiencehost.exe',
  'sihost.exe',
  'startmenuexperiencehost.exe',
  'svchost.exe',
  'systemsettings.exe',
  'taskhostw.exe',
  'textinputhost.exe',
  'wininit.exe',
  'winlogon.exe',
])

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const clean = value.trim()
    const key = clean.toLowerCase()
    if (!clean || seen.has(key)) continue
    seen.add(key)
    out.push(clean)
  }
  return out
}

function uniqueProcessNames(processes: string[]): string[] {
  return uniqueStrings(
    processes.filter((process) => !SAFE_PROCESS_NAMES.has(process.toLowerCase())),
  )
}

function domainMatchesAllowlist(domain: string, allowedDomains: string[]): boolean {
  return allowedDomains.some(
    (allowedDomain) => domain === allowedDomain || domain.endsWith(`.${allowedDomain}`),
  )
}

type DiscoveredApp = Awaited<ReturnType<typeof discoverInstalledApps>>[number]

function stripAutomaticProfilePrefix(sessionName: string): string {
  return sessionName.replace(/^(?:Vethos auto\s*-\s*|Session:\s*)/iu, '').trim()
}

function focusLabelMatches(candidate: string, label: string): boolean {
  const normalizedCandidate = candidate.toLocaleLowerCase('fr')
  const normalizedLabel = label.toLocaleLowerCase('fr')
  const untruncatedLabel = normalizedLabel.replace(/\.{3}$/u, '').trimEnd()
  return (
    normalizedCandidate === normalizedLabel ||
    normalizedLabel.includes(normalizedCandidate) ||
    (untruncatedLabel.length >= 12 && normalizedCandidate.startsWith(untruncatedLabel))
  )
}

export async function resolveAppExplanationFocus(
  storage: Storage,
  userId: string | undefined,
  sessionName: string,
): Promise<AppExplanationFocus> {
  const [tasksState, objectivesState] = await Promise.all([
    storage.read('tasks', userId),
    storage.read('objectives', userId),
  ])
  const label = stripAutomaticProfilePrefix(sessionName)
  const tasks = tasksState?.tasks ?? []
  const objectives = objectivesState?.objectives ?? []
  const task = tasks
    .filter((candidate) => {
      return focusLabelMatches(candidate.title, label)
    })
    .sort((a, b) => b.title.length - a.title.length)[0]

  if (task) {
    const objective = task.linkedObjectiveId
      ? objectives.find((candidate) => candidate.id === task.linkedObjectiveId)
      : undefined
    return {
      focusKind: 'task',
      focusLabel: task.title,
      taskId: task.id,
      taskTitle: task.title,
      ...(objective
        ? { objectiveId: objective.id, objectiveName: objective.name }
        : {}),
    }
  }

  const objective = objectives
    .filter((candidate) => {
      return focusLabelMatches(candidate.name, label)
    })
    .sort((a, b) => b.name.length - a.name.length)[0]
  if (objective) {
    return {
      focusKind: 'objective',
      focusLabel: objective.name,
      objectiveId: objective.id,
      objectiveName: objective.name,
    }
  }

  return {
    focusKind: 'session',
    focusLabel: label || sessionName,
  }
}

function localDateAndTime(now: Date): { localDate: string; localTime: string } {
  return {
    localDate: [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-'),
    localTime: [
      String(now.getHours()).padStart(2, '0'),
      String(now.getMinutes()).padStart(2, '0'),
      String(now.getSeconds()).padStart(2, '0'),
    ].join(':'),
  }
}

export function resolveAllowlistProfile(
  profile: BlockingProfile,
  discoveredApps: DiscoveredApp[],
  discoveredSites: DiscoveredSite[],
): BlockingProfile {
  const allowedProcs = new Set(profile.blockedProcesses.map((process) => process.toLowerCase()))
  const allowedPaths = new Set(profile.blockedNetworkApps.map((appPath) => appPath.toLowerCase()))
  const allowedSites = profile.blockedSites.map((domain) => domain.toLowerCase())

  const blockedProcesses =
    allowedProcs.size === 0
      ? []
      : uniqueProcessNames(
          discoveredApps
            .map((app) => app.exeName)
            .filter((exeName) => !allowedProcs.has(exeName.toLowerCase())),
        )

  const blockedNetworkApps =
    allowedPaths.size === 0 && allowedProcs.size === 0
      ? []
      : uniqueStrings(
          discoveredApps
            .filter(
              (app) =>
                app.exePath &&
                !allowedPaths.has(app.exePath.toLowerCase()) &&
                !allowedProcs.has(app.exeName.toLowerCase()) &&
                !SAFE_PROCESS_NAMES.has(app.exeName.toLowerCase()),
            )
            .map((app) => app.exePath),
        )

  const blockedSites =
    allowedSites.length === 0
      ? []
      : uniqueStrings(
          discoveredSites
            .map((site) => site.domain.toLowerCase())
            .filter(
              (domain) => DOMAIN_RE.test(domain) && !domainMatchesAllowlist(domain, allowedSites),
            ),
        )

  return {
    ...profile,
    blockedProcesses,
    blockedNetworkApps,
    blockedSites,
  }
}

/**
 * Relais de blocage : le blocage tourne dans le service Windows (cf. Lot 3).
 * Le `main` ne fait plus aucun blocage — il relaie les appels IPC `BLOCKING_*`
 * du renderer vers le service via le named pipe, et re-diffuse au renderer les
 * événements du service. Réf. spec §4.1, §6.
 */
export async function registerBlockingHandlers(
  storage: Storage,
  getMainWindow: () => BrowserWindow | null,
  options: {
    servicePipePath?: string
    allowServiceRepair?: boolean
    getCurrentUserId?: () => string | undefined
  } = {},
): Promise<{
  isSessionActive: () => boolean
  getActiveSession: () => ActiveSession | null
  setUserId: (userId?: string) => Promise<void>
}> {
  let lastServiceStatus: ServiceStatus | null = null
  let activeSessionUserId: string | undefined
  let activeSessionSnapshot: ActiveSession | null = null

  function parseOptionalUserId(rawUserId: unknown): string | undefined {
    if (rawUserId === undefined) return options.getCurrentUserId?.()
    if (typeof rawUserId !== 'string') {
      throw new Error('userId invalide')
    }
    const trimmed = rawUserId.trim()
    return trimmed ? trimmed : options.getCurrentUserId?.()
  }

  function emitServiceStatus(status: ServiceStatus): void {
    if (lastServiceStatus === status) return
    const previousStatus = lastServiceStatus
    lastServiceStatus = status
    getMainWindow()?.webContents.send(IPC_CHANNELS.BLOCKING_EVENT_SERVICE_STATUS, status)
    // On ne notifie que la bascule ok → unavailable : pas au tout premier
    // statut (previousStatus null), sinon une notif « service indisponible »
    // surgirait à chaque démarrage tant que le service n'est pas installé.
    if (status === 'unavailable' && previousStatus === 'ok') {
      notifyServiceDown(getMainWindow)
    }
  }

  const client = createServiceClient({
    pipePath: options.servicePipePath,
    onStatusChange: (connected) => {
      emitServiceStatus(connected ? 'ok' : 'unavailable')
      if (connected) {
        // Le service peut être resté actif pendant que l'interface était
        // fermée. Une resynchronisation explicite rejoue alors les apps déjà
        // détectées au lieu d'attendre leur prochaine ouverture.
        setTimeout(() => void synchronizeRecoveredBlocking(), 0)
      }
    },
  })
  let sessionActive = false
  let activeSessionId: string | null = null
  const pendingAppAttempts = new Map<
    string,
    {
      payload: BlockedAttemptPayload
      focus: AppExplanationFocus
      userId?: string
    }
  >()
  const temporaryAppAccess = new Map<string, number>()
  const temporaryAccessTimers = new Map<string, ReturnType<typeof setTimeout>>()
  const appExplanationInFlight = new Set<string>()
  const appPresentationInFlight = new Map<string, Promise<void>>()

  function applyRecoveredBlockingState(result: {
    state: BlockingState
    active: ActiveSession | null
  }): void {
    sessionActive = Boolean(result.active)
    activeSessionSnapshot = result.active
    activeSessionId = result.active?.id ?? null
    activeSessionUserId = result.active?.userId ?? options.getCurrentUserId?.()
    if (!result.active) clearTemporaryAppAccess()
  }

  async function synchronizeRecoveredBlocking(userId = options.getCurrentUserId?.()): Promise<{
    state: BlockingState
    active: ActiveSession | null
  } | null> {
    try {
      const result = (await client.request('RESYNC_BLOCKING', { userId })) as {
        state: BlockingState
        active: ActiveSession | null
      }
      applyRecoveredBlockingState(result)
      return result
    } catch (err) {
      log.warn('[blocking] reprise de session indisponible', err)
      return null
    }
  }

  function appAccessKey(payload: BlockedAttemptPayload): string {
    return `${payload.sessionId}:${payload.processName.toLocaleLowerCase('en')}`
  }

  function clearTemporaryAppAccess(): void {
    for (const timer of temporaryAccessTimers.values()) clearTimeout(timer)
    temporaryAccessTimers.clear()
    temporaryAppAccess.clear()
    pendingAppAttempts.clear()
    appExplanationInFlight.clear()
  }

  function restorePendingBlockedAppResources(): void {
    for (const [token, pending] of pendingAppAttempts) {
      restoreBlockedAppResources(token, pending.payload.pid, pending.payload.processName)
    }
  }

  async function presentBlockedApplicationNow(payload: BlockedAttemptPayload): Promise<void> {
    const accessKey = appAccessKey(payload)
    if ((temporaryAppAccess.get(accessKey) ?? 0) > Date.now()) return
    const existingAttempts = [...pendingAppAttempts].filter(
      ([, existing]) => appAccessKey(existing.payload) === accessKey,
    )
    const currentAttempt = existingAttempts[0]
    if (currentAttempt) {
      const [token, pending] = currentAttempt
      for (const [duplicateToken] of existingAttempts.slice(1)) {
        pendingAppAttempts.delete(duplicateToken)
      }
      showBlockOverlayWindow({
        targetName: pending.payload.processName,
        type: 'app',
        mode: pending.payload.mode,
        pid: pending.payload.pid,
        attemptToken: token,
        focusLabel: pending.focus.focusLabel,
        taskTitle: pending.focus.taskTitle,
        objectiveName: pending.focus.objectiveName,
      })
      return
    }

    if (activeSessionId !== payload.sessionId) return
    const userId = activeSessionUserId ?? options.getCurrentUserId?.()
    const focus: AppExplanationFocus = {
      focusKind: 'session',
      focusLabel: stripAutomaticProfilePrefix(payload.sessionName) || payload.sessionName,
    }
    const token = randomUUID()
    pendingAppAttempts.set(token, { payload, focus, userId })
    // L'overlay est armé immédiatement. La lecture des tâches/objectifs ne
    // doit jamais retarder la couverture visuelle de l'application.
    showBlockOverlayWindow({
      targetName: payload.processName,
      type: 'app',
      mode: payload.mode,
      pid: payload.pid,
      attemptToken: token,
      focusLabel: focus.focusLabel,
      taskTitle: focus.taskTitle,
      objectiveName: focus.objectiveName,
    })
    void resolveAppExplanationFocus(storage, userId, payload.sessionName)
      .then((resolvedFocus) => {
        const pending = pendingAppAttempts.get(token)
        if (pending) pending.focus = resolvedFocus
      })
      .catch((err) => log.warn('[blocking] contexte de priorité indisponible', err))
  }

  function presentBlockedApplication(payload: BlockedAttemptPayload): Promise<void> {
    const accessKey = appAccessKey(payload)
    const current = appPresentationInFlight.get(accessKey)
    if (current) return current
    const presentation = presentBlockedApplicationNow(payload).finally(() => {
      if (appPresentationInFlight.get(accessKey) === presentation) {
        appPresentationInFlight.delete(accessKey)
      }
    })
    appPresentationInFlight.set(accessKey, presentation)
    return presentation
  }

  async function startSessionNow(
    args: { profileId: string; durationMinutes: number },
    userId: string | undefined,
    sessionRulesEnabledOverride?: boolean,
  ): Promise<ActiveSession> {
    const settings = await storage.read('settings', userId)
    const stateResponse = (await client.request('GET_STATE', { userId })) as {
      state: BlockingState
    }
    const profile = stateResponse.state.profiles.find((candidate) => candidate.id === args.profileId)
    const processAllowlist =
      profile?.mode === 'allowlist' ? profile.blockedProcesses.slice() : undefined
    const resolvedProfile =
      profile && profile.mode === 'allowlist'
        ? resolveAllowlistProfile(
            profile,
            await discoverInstalledApps(),
            (await storage.read('discovered_sites', userId))?.sites ?? [],
          )
        : undefined

    const session = (await client.request('START_SESSION', {
      userId,
      profileId: args.profileId,
      durationMinutes: args.durationMinutes,
      sessionRulesEnabled:
        sessionRulesEnabledOverride ?? (settings?.sessionRulesEnabled !== false),
      strictBlocking: settings?.strictBlocking !== false,
      resolvedProfile,
      processAllowlist,
    })) as ActiveSession
    sessionActive = true
    activeSessionSnapshot = session
    activeSessionId = session.id
    activeSessionUserId = session.userId ?? userId
    notifySessionStart(
      session.profileSnapshot.name,
      session.durationMinutes ?? args.durationMinutes,
      getMainWindow,
    )
    return session
  }

  function launchBlockingTestApp(): void {
    // Ouvrir Spotify via son URI scheme natif pour déclencher l'application.
    shell.openExternal('spotify:').catch((err) => {
      log.error('[blocking-test] impossible d\'ouvrir Spotify', err)
    })
  }

  // ── Commandes renderer → service ─────────────────────────────────────────

  ipcMain.handle(IPC_CHANNELS.BLOCKING_GET_INITIAL_STATE, async (_e, rawUserId: unknown) => {
    const userId = parseOptionalUserId(rawUserId)
    const recovered = await synchronizeRecoveredBlocking(userId)
    if (!recovered) {
      throw new Error('Le blocage réel n’a pas pu être restauré par le service Vethos.')
    }
    return recovered
  })

  ipcMain.handle(IPC_CHANNELS.BLOCKING_SAVE_PROFILE, (_e, draft: unknown, rawUserId: unknown) =>
    client.request('SAVE_PROFILE', { draft, userId: parseOptionalUserId(rawUserId) }),
  )

  ipcMain.handle(IPC_CHANNELS.BLOCKING_DELETE_PROFILE, (_e, id: string, rawUserId: unknown) =>
    client.request('DELETE_PROFILE', { id, userId: parseOptionalUserId(rawUserId) }),
  )

  ipcMain.handle(
    IPC_CHANNELS.BLOCKING_START_SESSION,
    async (_e, args: { profileId: string; durationMinutes: number }, rawUserId: unknown) => {
      const userId = parseOptionalUserId(rawUserId)
      return startSessionNow(args, userId)
    },
  )

  ipcMain.handle(IPC_CHANNELS.BLOCKING_START_TEST, async (_e, rawUserId: unknown) => {
    const userId = parseOptionalUserId(rawUserId)
    if (sessionActive) throw new Error('Une session de blocage est déjà active.')
    await client.request('SAVE_PROFILE', {
      userId,
      draft: {
        id: TEST_BLOCKING_PROFILE_ID,
        name: 'Session: Test manuel du blocage',
        mode: 'blocklist',
        blockedSites: [],
        blockedProcesses: ['spotify.exe'],
        blockedNetworkApps: [],
        unlockPolicy: { type: 'none' },
      },
    })
    const session = await startSessionNow(
      { profileId: TEST_BLOCKING_PROFILE_ID, durationMinutes: TEST_BLOCKING_DURATION_MINUTES },
      userId,
      false,
    )
    await client
      .request('DELETE_PROFILE', { id: TEST_BLOCKING_PROFILE_ID, userId })
      .catch((err) => log.warn('[blocking-test] nettoyage du profil temporaire échoué', err))
    launchBlockingTestApp()
    return session
  })

  ipcMain.handle(IPC_CHANNELS.BLOCKING_REQUEST_UNLOCK, (_e, rawUserId: unknown) =>
    client.request('REQUEST_UNLOCK', { userId: parseOptionalUserId(rawUserId) }),
  )

  ipcMain.handle(
    IPC_CHANNELS.BLOCKING_SUBMIT_JUSTIFICATION,
    (_e, text: string, rawUserId: unknown) =>
      client.request('SUBMIT_JUSTIFICATION', { text, userId: parseOptionalUserId(rawUserId) }),
  )

  ipcMain.handle(
    IPC_CHANNELS.BLOCKING_SUBMIT_APP_EXPLANATION,
    async (_e, rawArgs: unknown) => {
      const args = rawArgs as { token?: unknown; text?: unknown }
      const token = typeof args?.token === 'string' ? args.token : ''
      const text = typeof args?.text === 'string' ? args.text.trim().slice(0, 2000) : ''
      const pending = pendingAppAttempts.get(token)
      if (!pending || !text) {
        return {
          allowed: false,
          reason: 'Cette demande n’est plus valide ou l’explication est vide.',
          allowMinutes: 0,
        }
      }
      if (appExplanationInFlight.has(token)) {
        return {
          allowed: false,
          reason: 'Coach analyse déjà cette explication.',
          allowMinutes: 0,
        }
      }

      appExplanationInFlight.add(token)
      try {
        const previousState = (await storage.read(
          'app_block_explanations',
          pending.userId,
        )) ?? { entries: [] }
        let coachDecision: Awaited<ReturnType<typeof evaluateAppExplanation>>
        let decision: AppBlockExplanation['decision']
        try {
          coachDecision = await evaluateAppExplanation({
            processName: pending.payload.processName,
            appName: pending.payload.processName.replace(/\.exe$/iu, ''),
            explanation: text,
            focus: pending.focus,
            previousExplanations: previousState.entries,
          })
          decision = coachDecision.allowed ? 'allowed' : 'denied'
        } catch (err) {
          log.error('[app-explanation] Coach evaluation failed', err)
          coachDecision = {
            allowed: false,
            reason: 'Coach est indisponible. La dérogation est refusée par sécurité.',
            allowMinutes: 0,
            necessityScore: 0,
            credibilityScore: 0,
            urgencyScore: 0,
          }
          decision = 'coach_error'
        }

        const createdAt = new Date()
        const entry: AppBlockExplanation = {
          id: randomUUID(),
          createdAt: createdAt.toISOString(),
          ...localDateAndTime(createdAt),
          processName: pending.payload.processName,
          appName: pending.payload.processName.replace(/\.exe$/iu, ''),
          explanation: text,
          sessionId: pending.payload.sessionId,
          profileId: pending.payload.profileId,
          sessionName: pending.payload.sessionName,
          mode: pending.payload.mode,
          ...pending.focus,
          decision,
          reason: coachDecision.reason,
          necessityScore: coachDecision.necessityScore,
          credibilityScore: coachDecision.credibilityScore,
          urgencyScore: coachDecision.urgencyScore,
          allowMinutes: coachDecision.allowMinutes,
        }
        await storage.write(
          'app_block_explanations',
          {
            entries: [entry, ...previousState.entries].slice(0, MAX_APP_EXPLANATION_HISTORY),
          },
          pending.userId,
        )

        if (coachDecision.allowed) {
          const key = appAccessKey(pending.payload)
          const durationMs = coachDecision.allowMinutes * 60_000
          temporaryAppAccess.set(key, Date.now() + durationMs)
          pendingAppAttempts.delete(token)
          permitBlockOverlayClose(token)

          const previousTimer = temporaryAccessTimers.get(key)
          if (previousTimer) clearTimeout(previousTimer)
          temporaryAccessTimers.set(
            key,
            setTimeout(() => {
              temporaryAccessTimers.delete(key)
              temporaryAppAccess.delete(key)
              if (activeSessionId !== pending.payload.sessionId) return
              void presentBlockedApplication(pending.payload)
            }, durationMs),
          )
        }

        return {
          allowed: coachDecision.allowed,
          reason: coachDecision.reason,
          allowMinutes: coachDecision.allowMinutes,
        }
      } finally {
        appExplanationInFlight.delete(token)
      }
    },
  )

  ipcMain.handle(IPC_CHANNELS.BLOCKING_GET_LAYER_STATUS, (_e, rawUserId: unknown) =>
    client.request('GET_LAYER_STATUS', { userId: parseOptionalUserId(rawUserId) }),
  )

  ipcMain.handle(IPC_CHANNELS.BLOCKING_GET_SERVICE_STATUS, () =>
    getServiceStatus(options.servicePipePath),
  )
  ipcMain.handle(IPC_CHANNELS.BLOCKING_REPAIR_SERVICE, async () => {
    if (options.allowServiceRepair === false) {
      const status = await getServiceStatus(options.servicePipePath)
      emitServiceStatus(status)
      return false
    }
    const launched = await requestServiceInstall()
    const status = await getServiceStatus(options.servicePipePath)
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
    const userId = session.userId ?? activeSessionUserId ?? options.getCurrentUserId?.()
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
    const { state } = (await client.request('GET_STATE', { userId })) as {
      state: { history: BlockingHistoryEntry[] }
    }
    const stats = await storage.read('stats', userId)
    await storage.write(
      'stats',
      {
        totalFocusMinutes: (stats?.totalFocusMinutes ?? 0) + durationMin,
        totalSessions: (stats?.totalSessions ?? 0) + 1,
        longestStreak: Math.max(
          stats?.longestStreak ?? 0,
          computeLongestStreak(state.history ?? []),
        ),
        lastUpdated: new Date().toISOString(),
      },
      userId,
    )
  }

  async function handleServiceEvent(event: ServiceEvent): Promise<void> {
    const win = getMainWindow()
    switch (event.type) {
      case 'SESSION_CHANGED':
        // Le service émet SESSION_CHANGED(null) avant SESSION_ENDED en fin de session.
        sessionActive = event.payload !== null
        activeSessionSnapshot = event.payload as ActiveSession | null
        if (event.payload) {
          activeSessionId = (event.payload as ActiveSession).id
          activeSessionUserId =
            (event.payload as ActiveSession).userId ??
            activeSessionUserId ??
            options.getCurrentUserId?.()
        } else {
          activeSessionId = null
          restorePendingBlockedAppResources()
          closeBlockOverlayWindow()
          clearTemporaryAppAccess()
        }
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
        showRecoveryBreakWindow(payload.restMinutes)
        notifyBreakRequired(payload.restMinutes, getMainWindow)
        return
      }
      case 'BLOCKED_ATTEMPT': {
        const payload = event.payload as BlockedAttemptPayload
        win?.webContents.send(IPC_CHANNELS.BLOCKING_EVENT_BLOCKED_ATTEMPT, payload)
        await presentBlockedApplication(payload)
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

  return {
    isSessionActive: () => sessionActive,
    getActiveSession: () => activeSessionSnapshot,
    setUserId: async (userId?: string) => {
      await client.request('SET_USER_CONTEXT', { userId })
      if (userId) {
        await synchronizeRecoveredBlocking(userId)
      } else {
        applyRecoveredBlockingState({
          state: { profiles: [], history: [], nextSessionPenaltyMinutes: 0 },
          active: null,
        })
      }
    },
  }
}
