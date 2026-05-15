import { randomUUID } from 'node:crypto'
import type { ActiveSession, BlockingState } from '@shared/schemas'
import type { BlockingHistoryEntry } from '@shared/schemas'
import type { SessionPhase } from './types'
import { isCooldownReady } from './locks/cooldown'
import { isJustificationValid } from './locks/justification'
import { monotonicNowMs, remainingSessionMs } from './timer'

export type HostsAdapter = {
  apply: (args: { sessionId: string; startedAt: string; domains: string[] }) => Promise<void>
  clear: () => Promise<void>
  flushDns: () => Promise<void>
}
export type ProcessAdapter = {
  start: (forbidden: string[]) => { stop: () => void }
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
    profileId: string
    durationMinutes: number
  }) => Promise<ActiveSession>
  requestUnlock: () => Promise<ActiveSession['unlockState']>
  submitJustification: (text: string) => Promise<{ ok: true } | { ok: false; reason: string }>
  endSessionForce: (reason: 'timer' | 'unlock') => Promise<void>
  hydrateFromDisk: () => Promise<void>
  on: {
    (event: 'sessionChanged', cb: (s: ActiveSession | null) => void): void
    (event: 'sessionEnded', cb: (entry: BlockingHistoryEntry, session: ActiveSession) => void): void
  }
}

export function createSessionManager(adapters: SessionManagerAdapters): SessionManager {
  let phase: SessionPhase = 'idle'
  let active: ActiveSession | null = null
  let watcherHandle: { stop: () => void } | null = null
  let endTimer: ReturnType<typeof setTimeout> | null = null
  const listeners: Array<(s: ActiveSession | null) => void> = []
  const endedListeners: Array<(entry: BlockingHistoryEntry, session: ActiveSession) => void> = []

  function emit() {
    for (const l of listeners) l(active)
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
    profileId,
    durationMinutes,
  }: {
    profileId: string
    durationMinutes: number
  }): Promise<ActiveSession> {
    if (phase !== 'idle') throw new Error('A session is already active')
    const state = await adapters.persistence.readState()
    const profile = state.profiles.find((p) => p.id === profileId)
    if (!profile) throw new Error(`Profile not found: ${profileId}`)

    phase = 'starting'
    const id = randomUUID()
    const startedAtWall = Date.now()
    const startedAtMono = monotonicNowMs()
    const startedAt = new Date(startedAtWall).toISOString()
    const endsAt = new Date(startedAtWall + durationMinutes * 60_000).toISOString()
    const session: ActiveSession = {
      id,
      profileId,
      profileSnapshot: profile,
      startedAt,
      endsAt,
      startedAtWall,
      startedAtMono,
      durationMinutes,
      unlockState: { phase: 'locked' },
      appliedFirewallRules: [],
    }

    let hostsApplied = false
    let watcherStarted = false
    try {
      await adapters.persistence.writeActive(session)
      await adapters.hosts.apply({
        sessionId: id,
        startedAt,
        domains: profile.blockedSites,
      })
      hostsApplied = true
      await adapters.hosts.flushDns()
      watcherHandle = adapters.processes.start(profile.blockedProcesses)
      watcherStarted = true
      const ruleNames = await adapters.firewall.applyAll(id, profile.blockedNetworkApps)
      session.appliedFirewallRules = ruleNames
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

  async function endSessionForce(reason: 'timer' | 'unlock'): Promise<void> {
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
      await adapters.firewall.removeAll().catch(() => {})
      await adapters.hosts.clear().catch(() => {})
      await adapters.hosts.flushDns().catch(() => {})
      return
    }
    if (remainingSessionMs(existing) <= 0) {
      await adapters.firewall.removeAll().catch(() => {})
      await adapters.hosts.clear().catch(() => {})
      await adapters.hosts.flushDns().catch(() => {})
      await adapters.persistence.clearActive()
      return
    }
    await adapters.hosts.apply({
      sessionId: existing.id,
      startedAt: existing.startedAt,
      domains: existing.profileSnapshot.blockedSites,
    })
    await adapters.hosts.flushDns()
    watcherHandle = adapters.processes.start(existing.profileSnapshot.blockedProcesses)
    const ruleNames = await adapters.firewall.applyAll(
      existing.id,
      existing.profileSnapshot.blockedNetworkApps,
    )
    await adapters.firewall.removeOrphansExcept(ruleNames)
    existing.appliedFirewallRules = ruleNames
    await adapters.persistence.writeActive(existing)
    active = existing
    phase = 'active'
    scheduleEndTimer()
    emit()
  }

  return {
    getPhase: () => phase,
    getActive: () => active,
    startSession,
    requestUnlock,
    submitJustification,
    endSessionForce,
    hydrateFromDisk,
    on: (event: 'sessionChanged' | 'sessionEnded', cb: unknown) => {
      if (event === 'sessionChanged') {
        listeners.push(cb as (s: ActiveSession | null) => void)
        return
      }
      endedListeners.push(cb as (entry: BlockingHistoryEntry, session: ActiveSession) => void)
    },
  }
}
