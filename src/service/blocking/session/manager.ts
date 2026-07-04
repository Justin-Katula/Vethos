import { randomUUID } from 'node:crypto'
import { SLEEP_LOCKDOWN_PROCESS_MARKER, type BlockedAttemptPayload } from '@shared/blocking'
import type { ActiveSession, BlockingState, BlockingProfile } from '@shared/schemas'
import type { BlockingHistoryEntry } from '@shared/schemas'
import type { SessionPhase } from './types'
import { isCooldownReady } from './locks/cooldown'
import { isJustificationValid } from './locks/justification'
import { currentBootWallMs, monotonicNowMs, remainingSessionMs } from './timer'
import { buildProtectionResult, type ProtectionFailure } from '@shared/protection-result'
import type { ProtectionLayer } from '@shared/engine-results'

export type ProcessStartOptions = {
  mode: BlockingProfile['mode']
  allowedExeNames?: string[]
}

export type HostsAdapter = {
  apply: (args: { sessionId: string; startedAt: string; domains: string[] }) => Promise<void>
  clear: () => Promise<void>
  flushDns: () => Promise<void>
}
export type ProcessAdapter = {
  start: (
    forbidden: string[],
    onBlocked?: (attempt: { processName: string; pid: number; blockAll: boolean }) => void,
    options?: ProcessStartOptions,
  ) => { stop: () => void }
}
export type FirewallAdapter = {
  applyAll: (sessionId: string, exes: string[]) => Promise<string[]>
  removeAll: () => Promise<void>
  removeOrphansExcept: (validNames: string[]) => Promise<void>
  applied: () => string[]
}
export type PersistenceAdapter = {
  readState: () => Promise<BlockingState>
  writeState: (s: BlockingState) => Promise<void>
  readActive: () => Promise<ActiveSession | null>
  writeActive: (s: ActiveSession) => Promise<void>
  clearActive: () => Promise<void>
}

export type SessionManagerAdapters = {
  hosts: HostsAdapter
  processes: ProcessAdapter
  firewall: FirewallAdapter
  persistence: PersistenceAdapter
}

export type SessionManager = {
  getPhase: () => SessionPhase
  getActive: () => ActiveSession | null
  startSession: (args: {
    userId?: string
    profileId: string
    durationMinutes: number
    resolvedProfile?: BlockingProfile
    processAllowlist?: string[]
  }) => Promise<ActiveSession>
  requestUnlock: () => Promise<ActiveSession['unlockState']>
  submitJustification: (text: string) => Promise<{ ok: true } | { ok: false; reason: string }>
  endSessionForce: (reason: 'timer' | 'unlock' | 'disconnect') => Promise<void>
  hydrateFromDisk: () => Promise<void>
  updateProtectionAudit: (
    appliedLayers: ProtectionLayer[],
    failures: ProtectionFailure[],
  ) => Promise<ActiveSession['protectionResult'] | null>
  on: {
    (event: 'sessionChanged', cb: (s: ActiveSession | null) => void): void
    (event: 'sessionEnded', cb: (entry: BlockingHistoryEntry, session: ActiveSession) => void): void
    (event: 'blockedAttempt', cb: (payload: BlockedAttemptPayload) => void): void
  }
}

export function createSessionManager(adapters: SessionManagerAdapters): SessionManager {
  let phase: SessionPhase = 'idle'
  let active: ActiveSession | null = null
  let watcherHandle: { stop: () => void } | null = null
  let endTimer: ReturnType<typeof setTimeout> | null = null
  const listeners: Array<(s: ActiveSession | null) => void> = []
  const endedListeners: Array<(entry: BlockingHistoryEntry, session: ActiveSession) => void> = []
  const blockedAttemptListeners: Array<(payload: BlockedAttemptPayload) => void> = []

  function blockingSnapshot(session: ActiveSession) {
    const profile = session.profileSnapshot
    const processNames = session.processAllowlist ?? profile.blockedProcesses
    if (profile.mode === 'allowlist') {
      return {
        allowedApps: [...processNames, ...profile.blockedNetworkApps],
        allowedSites: profile.blockedSites,
      }
    }
    return {
      blockedApps: [...profile.blockedProcesses, ...profile.blockedNetworkApps],
      blockedSites: profile.blockedSites,
    }
  }

  function requestedProtectionLayers(session: ActiveSession): ProtectionLayer[] {
    const profile = session.profileSnapshot
    const layers: ProtectionLayer[] = []
    if (profile.blockedSites.length > 0) layers.push('hosts')
    const hasProcessWatcher = profile.mode === 'allowlist' || profile.blockedProcesses.length > 0
    if (hasProcessWatcher) {
      layers.push('process_watcher')
      layers.push('overlay')
      layers.push('media_control')
    }
    if (profile.blockedNetworkApps.length > 0) layers.push('firewall')
    layers.push('service_recovery')
    return layers
  }

  function recordAppliedProtection(session: ActiveSession, extraLayers: ProtectionLayer[] = []): void {
    session.protectionResult = buildProtectionResult(
      session,
      [...requestedProtectionLayers(session), ...extraLayers],
      [],
      blockingSnapshot(session),
    )
  }

  function emit() {
    for (const l of listeners) l(active)
  }

  function isSleepLockdownProfile(profile: BlockingProfile): boolean {
    return profile.blockedProcesses
      .map((processName) => processName.toLowerCase())
      .includes(SLEEP_LOCKDOWN_PROCESS_MARKER)
  }

  function createBlockedAttemptHandler(
    session: ActiveSession,
  ): (attempt: { processName: string; pid: number; blockAll: boolean }) => void {
    const mode = isSleepLockdownProfile(session.profileSnapshot) ? 'sleep' : 'work'
    return (attempt) => {
      const payload: BlockedAttemptPayload = {
        kind: 'app',
        processName: attempt.processName,
        pid: attempt.pid,
        blockAll: attempt.blockAll,
        mode,
        sessionId: session.id,
        profileId: session.profileId,
        sessionName: session.profileSnapshot.name,
      }
      for (const listener of blockedAttemptListeners) listener(payload)
    }
  }

  function restartProcessWatcher(session: ActiveSession): void {
    watcherHandle?.stop()
    watcherHandle = adapters.processes.start(
      session.profileSnapshot.blockedProcesses,
      createBlockedAttemptHandler(session),
      {
        mode: session.profileSnapshot.mode,
        allowedExeNames:
          session.profileSnapshot.mode === 'allowlist'
            ? session.processAllowlist ?? session.profileSnapshot.blockedProcesses
            : undefined,
      },
    )
  }

  function scheduleEndTimer() {
    if (endTimer) clearTimeout(endTimer)
    if (!active) return
    const ms = remainingSessionMs(active)
    if (ms <= 0) {
      void endSessionForce('timer')
      return
    }
    endTimer = setTimeout(() => {
      void endSessionForce('timer')
    }, ms)
  }

  async function startSession({
    userId,
    profileId,
    durationMinutes,
    resolvedProfile,
    processAllowlist,
  }: {
    userId?: string
    profileId: string
    durationMinutes: number
    resolvedProfile?: BlockingProfile
    processAllowlist?: string[]
  }): Promise<ActiveSession> {
    if (phase !== 'idle') throw new Error('A session is already active')
    const state = await adapters.persistence.readState()
    const profile = state.profiles.find((p) => p.id === profileId)
    if (!profile) throw new Error(`Profile not found: ${profileId}`)

    const activeProfile = resolvedProfile ?? profile

    const effectiveProcessAllowlist = processAllowlist ?? activeProfile.blockedProcesses
    if (
      activeProfile.mode === 'allowlist' &&
      effectiveProcessAllowlist.length === 0 &&
      activeProfile.blockedSites.length === 0 &&
      activeProfile.blockedNetworkApps.length === 0
    ) {
      throw new Error('Empty allowlist refused: no useful app or site is configured')
    }

    phase = 'starting'
    const id = randomUUID()
    const startedAtWall = Date.now()
    const startedAtMono = monotonicNowMs()
    const startedAtBootWall = currentBootWallMs(startedAtWall)
    const startedAt = new Date(startedAtWall).toISOString()
    const endsAt = new Date(startedAtWall + durationMinutes * 60_000).toISOString()
    const session: ActiveSession = {
      id,
      ...(userId ? { userId } : {}),
      profileId,
      profileSnapshot: activeProfile,
      startedAt,
      endsAt,
      startedAtWall,
      startedAtMono,
      startedAtBootWall,
      durationMinutes,
      unlockState: { phase: 'locked' },
      appliedFirewallRules: [],
      ...(activeProfile.mode === 'allowlist'
        ? { processAllowlist: effectiveProcessAllowlist }
        : {}),
    }

    let hostsApplied = false
    let watcherStarted = false
    try {
      await adapters.persistence.writeActive(session)
      await adapters.hosts.apply({
        sessionId: id,
        startedAt,
        domains: activeProfile.blockedSites,
      })
      hostsApplied = true
      await adapters.hosts.flushDns()
      restartProcessWatcher(session)
      watcherStarted = true
      const ruleNames = await adapters.firewall.applyAll(id, activeProfile.blockedNetworkApps)
      session.appliedFirewallRules = ruleNames
      recordAppliedProtection(session)
      await adapters.persistence.writeActive(session)
      active = session
      phase = 'active'
      scheduleEndTimer()
      emit()
      return session
    } catch (err) {
      if (watcherStarted && watcherHandle) {
        watcherHandle.stop()
        watcherHandle = null
      }
      if (hostsApplied) {
        await adapters.hosts.clear().catch(() => {})
        await adapters.hosts.flushDns().catch(() => {})
      }
      await adapters.firewall.removeAll().catch(() => {})
      await adapters.persistence.clearActive().catch(() => {})
      phase = 'idle'
      active = null
      throw err
    }
  }

  async function endSessionForce(reason: 'timer' | 'unlock' | 'disconnect'): Promise<void> {
    if (phase === 'idle' || !active) return
    phase = 'ending'
    if (endTimer) {
      clearTimeout(endTimer)
      endTimer = null
    }
    if (watcherHandle) {
      watcherHandle.stop()
      watcherHandle = null
    }
    await adapters.firewall.removeAll().catch(() => {})
    await adapters.hosts.clear().catch(() => {})
    await adapters.hosts.flushDns().catch(() => {})

    const state = await adapters.persistence.readState()
    const endedSession = active
    const historyEntry: BlockingHistoryEntry = {
      sessionId: active.id,
      profileId: active.profileId,
      startedAt: active.startedAt,
      endedAt: new Date().toISOString(),
      completedNormally: reason === 'timer',
    }
    state.history.unshift(historyEntry)
    if (state.history.length > 500) state.history.length = 500
    if (reason === 'unlock') {
      state.nextSessionPenaltyMinutes = Math.min(240, (state.nextSessionPenaltyMinutes ?? 0) + 15)
    }
    await adapters.persistence.writeState(state)
    await adapters.persistence.clearActive()

    active = null
    phase = 'idle'
    emit()
    for (const listener of endedListeners) listener(historyEntry, endedSession)
  }

  async function requestUnlock(): Promise<ActiveSession['unlockState']> {
    if (!active) throw new Error('No active session')
    const policy = active.profileSnapshot.unlockPolicy
    if (policy.type === 'deny_during_strict_session') {
      return { phase: 'locked' }
    }
    if (policy.type === 'none') {
      await endSessionForce('unlock')
      return { phase: 'unlocked', reason: 'no policy' }
    }
    if (policy.type === 'justification') {
      active.unlockState = { phase: 'awaiting_justification' }
      await adapters.persistence.writeActive(active)
      emit()
      return active.unlockState
    }
    active.unlockState = { phase: 'cooldown', startedAt: new Date().toISOString() }
    await adapters.persistence.writeActive(active)
    emit()
    return active.unlockState
  }

  async function submitJustification(
    text: string,
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    if (!active) return { ok: false, reason: 'no active session' }
    const policy = active.profileSnapshot.unlockPolicy
    const now = Date.now()

    if (policy.type === 'deny_during_strict_session') {
      return { ok: false, reason: 'unlock denied during strict session' }
    }

    if (policy.type === 'none') {
      await endSessionForce('unlock')
      return { ok: true }
    }
    if (policy.type === 'cooldown') {
      if (active.unlockState.phase !== 'cooldown') {
        return { ok: false, reason: 'request unlock first' }
      }
      if (!isCooldownReady(active.unlockState.startedAt, policy.minutes, now)) {
        return { ok: false, reason: 'cooldown not elapsed' }
      }
      await endSessionForce('unlock')
      return { ok: true }
    }
    if (policy.type === 'justification') {
      if (!isJustificationValid(text, policy.minWords)) {
        return { ok: false, reason: `justification needs at least ${policy.minWords} words` }
      }
      await endSessionForce('unlock')
      return { ok: true }
    }
    if (active.unlockState.phase !== 'cooldown') {
      return { ok: false, reason: 'request unlock first' }
    }
    if (!isCooldownReady(active.unlockState.startedAt, policy.minutes, now)) {
      return { ok: false, reason: 'cooldown not elapsed' }
    }
    if (!isJustificationValid(text, policy.minWords)) {
      return { ok: false, reason: `justification needs at least ${policy.minWords} words` }
    }
    await endSessionForce('unlock')
    return { ok: true }
  }

  async function hydrateFromDisk(): Promise<void> {
    const existing = await adapters.persistence.readActive()
    if (!existing) {
      watcherHandle?.stop()
      watcherHandle = null
      if (endTimer) clearTimeout(endTimer)
      endTimer = null
      const hadActiveSession = active !== null
      active = null
      phase = 'idle'
      await adapters.firewall.removeAll().catch(() => {})
      await adapters.hosts.clear().catch(() => {})
      await adapters.hosts.flushDns().catch(() => {})
      if (hadActiveSession) emit()
      return
    }
    if (remainingSessionMs(existing) <= 0) {
      watcherHandle?.stop()
      watcherHandle = null
      if (endTimer) clearTimeout(endTimer)
      endTimer = null
      const hadActiveSession = active !== null
      active = null
      phase = 'idle'
      await adapters.firewall.removeAll().catch(() => {})
      await adapters.hosts.clear().catch(() => {})
      await adapters.hosts.flushDns().catch(() => {})
      await adapters.persistence.clearActive()
      if (hadActiveSession) emit()
      return
    }
    await adapters.hosts.apply({
      sessionId: existing.id,
      startedAt: existing.startedAt,
      domains: existing.profileSnapshot.blockedSites,
    })
    await adapters.hosts.flushDns()
    const ruleNames = await adapters.firewall.applyAll(
      existing.id,
      existing.profileSnapshot.blockedNetworkApps,
    )
    await adapters.firewall.removeOrphansExcept(ruleNames)
    existing.appliedFirewallRules = ruleNames
    recordAppliedProtection(existing, ['service_recovery'])
    await adapters.persistence.writeActive(existing)
    active = existing
    phase = 'active'
    scheduleEndTimer()
    // Réarmer le watcher remet son cache de notifications à zéro : toutes les
    // applications déjà ouvertes sont ainsi rejouées à l'interface reconnectée.
    restartProcessWatcher(existing)
    emit()
  }

  async function updateProtectionAudit(
    appliedLayers: ProtectionLayer[],
    failures: ProtectionFailure[],
  ): Promise<ActiveSession['protectionResult'] | null> {
    if (!active) return null
    active.protectionResult = buildProtectionResult(
      active,
      appliedLayers,
      failures,
      blockingSnapshot(active),
    )
    await adapters.persistence.writeActive(active)
    emit()
    return active.protectionResult
  }

  return {
    getPhase: () => phase,
    getActive: () => active,
    startSession,
    requestUnlock,
    submitJustification,
    endSessionForce,
    hydrateFromDisk,
    updateProtectionAudit,
    on: (event: 'sessionChanged' | 'sessionEnded' | 'blockedAttempt', cb: unknown) => {
      if (event === 'sessionChanged') {
        listeners.push(cb as (s: ActiveSession | null) => void)
        return
      }
      if (event === 'blockedAttempt') {
        blockedAttemptListeners.push(cb as (payload: BlockedAttemptPayload) => void)
        return
      }
      endedListeners.push(cb as (entry: BlockingHistoryEntry, session: ActiveSession) => void)
    },
  }
}
