import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createSessionManager } from './manager'
import type { BlockingProfile } from '@shared/schemas'

const PROFILE: BlockingProfile = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'P',
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
      applied: vi.fn().mockReturnValue(['rule1']),
    },
    persistence: {
      readState: vi.fn().mockResolvedValue({ profiles: [PROFILE], history: [] }),
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
    await m.startSession({ profileId: PROFILE.id, durationMinutes: 60 })
    expect(a.hosts.apply).toHaveBeenCalled()
    expect(a.processes.start).toHaveBeenCalledWith(['notepad.exe'])
    expect(a.firewall.applyAll).toHaveBeenCalled()
    expect(a.hosts.flushDns).toHaveBeenCalled()
    expect(a.persistence.writeActive).toHaveBeenCalled()
    expect(m.getPhase()).toBe('active')
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
})
