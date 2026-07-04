import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createSessionManager } from './manager'
import type { BlockingProfile } from '@shared/schemas'

const PROFILE: BlockingProfile = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'P',
  mode: 'blocklist',
  blockedSites: ['example.com'],
  blockedProcesses: ['notepad.exe'],
  blockedNetworkApps: ['C:\\Windows\\System32\\notepad.exe'],
  unlockPolicy: { type: 'cooldown_and_justification', minutes: 5, minWords: 50 },
  createdAt: '2026-05-04T09:00:00.000Z',
}

function makeAdapters() {
  return {
    hosts: {
      apply: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined),
      flushDns: vi.fn().mockResolvedValue(undefined),
    },
    processes: { start: vi.fn().mockReturnValue({ stop: vi.fn() }) },
    firewall: {
      applyAll: vi.fn().mockResolvedValue(['rule1']),
      removeAll: vi.fn().mockResolvedValue(undefined),
      removeOrphansExcept: vi.fn().mockResolvedValue(undefined),
      applied: vi.fn().mockReturnValue(['rule1']),
    },
    persistence: {
      readState: vi.fn().mockResolvedValue({
        profiles: [PROFILE],
        history: [],
        nextSessionPenaltyMinutes: 0,
      }),
      writeState: vi.fn().mockResolvedValue(undefined),
      readActive: vi.fn().mockResolvedValue(null),
      writeActive: vi.fn().mockResolvedValue(undefined),
      clearActive: vi.fn().mockResolvedValue(undefined),
    },
  }
}

describe('SessionManager', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-05-04T10:00:00.000Z') })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('start happy path applies all 3 layers atomically', async () => {
    const a = makeAdapters()
    const m = createSessionManager(a)
    const session = await m.startSession({ profileId: PROFILE.id, durationMinutes: 60 })
    expect(a.hosts.apply).toHaveBeenCalled()
    expect(a.processes.start).toHaveBeenCalledWith(['notepad.exe'], expect.any(Function), {
      mode: 'blocklist',
      allowedExeNames: undefined,
    })
    expect(a.firewall.applyAll).toHaveBeenCalled()
    expect(a.hosts.flushDns).toHaveBeenCalled()
    expect(a.persistence.writeActive).toHaveBeenCalled()
    expect(m.getPhase()).toBe('active')
    expect(session.protectionResult).toEqual(
      expect.objectContaining({
        applied: true,
        appliedLayers: ['hosts', 'process_watcher', 'overlay', 'media_control', 'firewall', 'service_recovery'],
        failedLayers: [],
      }),
    )
  })

  it('passes the original process allowlist to the process layer', async () => {
    const a = makeAdapters()
    const m = createSessionManager(a)
    const resolvedProfile: BlockingProfile = {
      ...PROFILE,
      mode: 'allowlist',
      blockedProcesses: ['discord.exe', 'steam.exe'],
    }

    const session = await m.startSession({
      profileId: PROFILE.id,
      durationMinutes: 60,
      resolvedProfile,
      processAllowlist: ['code.exe'],
    })

    expect(session.processAllowlist).toEqual(['code.exe'])
    expect(a.processes.start).toHaveBeenCalledWith(['discord.exe', 'steam.exe'], expect.any(Function), {
      mode: 'allowlist',
      allowedExeNames: ['code.exe'],
    })
  })

  it('refuses an empty allowlist before applying any blocking layer', async () => {
    const a = makeAdapters()
    const m = createSessionManager(a)
    const emptyAllowlist: BlockingProfile = {
      ...PROFILE,
      mode: 'allowlist',
      blockedSites: [],
      blockedProcesses: [],
      blockedNetworkApps: [],
    }

    await expect(
      m.startSession({
        profileId: PROFILE.id,
        durationMinutes: 60,
        resolvedProfile: emptyAllowlist,
        processAllowlist: [],
      }),
    ).rejects.toThrow('Empty allowlist refused')

    expect(a.hosts.apply).not.toHaveBeenCalled()
    expect(a.processes.start).not.toHaveBeenCalled()
    expect(a.firewall.applyAll).not.toHaveBeenCalled()
    expect(m.getPhase()).toBe('idle')
  })

  it('rolls back hosts if firewall throws', async () => {
    const a = makeAdapters()
    a.firewall.applyAll.mockRejectedValueOnce(new Error('netsh failed'))
    const m = createSessionManager(a)
    await expect(
      m.startSession({ profileId: PROFILE.id, durationMinutes: 60 }),
    ).rejects.toThrow()
    expect(a.hosts.clear).toHaveBeenCalled()
    expect(m.getPhase()).toBe('idle')
  })

  it('records a failed runtime layer honestly in the active session audit', async () => {
    const a = makeAdapters()
    const m = createSessionManager(a)
    await m.startSession({ profileId: PROFILE.id, durationMinutes: 60 })

    const result = await m.updateProtectionAudit(
      ['hosts', 'process_watcher'],
      [{ layer: 'firewall', message: 'firewall: drifted' }],
    )

    expect(result).toEqual(
      expect.objectContaining({
        applied: false,
        appliedLayers: ['hosts', 'process_watcher'],
        failedLayers: ['firewall'],
        warnings: ['firewall: drifted'],
      }),
    )
    expect(a.persistence.writeActive).toHaveBeenLastCalledWith(
      expect.objectContaining({ protectionResult: result }),
    )
  })

  it('refuses requestUnlock+submitJustification before cooldown elapses', async () => {
    const a = makeAdapters()
    const m = createSessionManager(a)
    await m.startSession({ profileId: PROFILE.id, durationMinutes: 60 })
    await m.requestUnlock()
    vi.setSystemTime(new Date('2026-05-04T10:02:00.000Z'))
    const r = await m.submitJustification('a '.repeat(100))
    expect(r.ok).toBe(false)
  })

  it('accepts unlock after cooldown + valid justification', async () => {
    const a = makeAdapters()
    const m = createSessionManager(a)
    await m.startSession({ profileId: PROFILE.id, durationMinutes: 60 })
    await m.requestUnlock()
    vi.setSystemTime(new Date('2026-05-04T10:06:00.000Z'))
    const txt = Array(60).fill('mot').join(' ')
    const r = await m.submitJustification(txt)
    expect(r.ok).toBe(true)
    expect(a.hosts.clear).toHaveBeenCalled()
    expect(a.firewall.removeAll).toHaveBeenCalled()
    expect(m.getPhase()).toBe('idle')
  })

  it('denies every early stop request during a strict session', async () => {
    const a = makeAdapters()
    const strictProfile: BlockingProfile = {
      ...PROFILE,
      unlockPolicy: { type: 'deny_during_strict_session' },
    }
    a.persistence.readState.mockResolvedValue({ profiles: [strictProfile], history: [], nextSessionPenaltyMinutes: 0 })
    const m = createSessionManager(a)
    await m.startSession({ profileId: strictProfile.id, durationMinutes: 60 })

    expect(await m.requestUnlock()).toEqual({ phase: 'locked' })
    expect(await m.submitJustification('demande détaillée')).toEqual({
      ok: false,
      reason: 'unlock denied during strict session',
    })
    expect(m.getPhase()).toBe('active')
  })

  it('adds a 15 minute penalty after early unlock', async () => {
    const a = makeAdapters()
    const m = createSessionManager(a)
    await m.startSession({ profileId: PROFILE.id, durationMinutes: 60 })
    await m.requestUnlock()
    vi.setSystemTime(new Date('2026-05-04T10:06:00.000Z'))
    const txt = Array(60).fill('mot').join(' ')

    await m.submitJustification(txt)

    expect(a.persistence.writeState).toHaveBeenCalledWith(
      expect.objectContaining({ nextSessionPenaltyMinutes: 15 }),
    )
  })

  it('cleans orphan blocking layers at boot when no active session exists', async () => {
    const a = makeAdapters()
    const m = createSessionManager(a)

    await m.hydrateFromDisk()

    expect(a.firewall.removeAll).toHaveBeenCalled()
    expect(a.hosts.clear).toHaveBeenCalled()
    expect(a.hosts.flushDns).toHaveBeenCalled()
  })

  it('réarme et rejoue la surveillance des processus à chaque reconnexion', async () => {
    const a = makeAdapters()
    const active = {
      id: '22222222-2222-4222-8222-222222222222',
      userId: 'user_123',
      profileId: PROFILE.id,
      profileSnapshot: PROFILE,
      startedAt: '2026-05-04T09:30:00.000Z',
      endsAt: '2026-05-04T11:30:00.000Z',
      startedAtWall: new Date('2026-05-04T09:30:00.000Z').getTime(),
      durationMinutes: 120,
      unlockState: { phase: 'locked' as const },
      appliedFirewallRules: [],
    }
    a.persistence.readActive.mockResolvedValue(active)
    const firstStop = vi.fn()
    const secondStop = vi.fn()
    a.processes.start
      .mockReturnValueOnce({ stop: firstStop })
      .mockReturnValueOnce({ stop: secondStop })
    const m = createSessionManager(a)

    await m.hydrateFromDisk()
    await m.hydrateFromDisk()

    expect(a.processes.start).toHaveBeenCalledTimes(2)
    expect(firstStop).toHaveBeenCalledTimes(1)
    expect(m.getActive()?.id).toBe(active.id)
    expect(m.getActive()?.protectionResult?.appliedLayers).toEqual([
      'hosts',
      'process_watcher',
      'overlay',
      'media_control',
      'firewall',
      'service_recovery',
    ])
    expect(m.getPhase()).toBe('active')
  })
})
