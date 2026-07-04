import { describe, expect, it } from 'vitest'
import { remainingSessionMs } from './timer'
import type { ActiveSession, BlockingProfile } from '@shared/schemas'

const PROFILE: BlockingProfile = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Timer',
  mode: 'blocklist',
  blockedSites: [],
  blockedProcesses: ['notepad.exe'],
  blockedNetworkApps: [],
  unlockPolicy: { type: 'none' },
  createdAt: '2026-06-21T20:00:00.000Z',
}

function session(): ActiveSession {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    profileId: PROFILE.id,
    profileSnapshot: PROFILE,
    startedAt: '2026-06-21T22:00:00.000Z',
    endsAt: '2026-06-22T00:00:00.000Z',
    startedAtWall: new Date('2026-06-21T22:00:00.000Z').getTime(),
    startedAtMono: 1_000,
    startedAtBootWall: new Date('2026-06-20T10:00:00.000Z').getTime(),
    durationMinutes: 120,
    unlockState: { phase: 'locked' },
    appliedFirewallRules: [],
  }
}

describe('remainingSessionMs across Windows restarts', () => {
  it('utilise le temps mural après un reboot au lieu de comparer deux horloges monotones', () => {
    const active = session()
    const now = new Date('2026-06-21T22:30:00.000Z').getTime()
    const newBoot = new Date('2026-06-21T22:20:00.000Z').getTime()

    expect(remainingSessionMs(active, now, 50_000_000, newBoot)).toBe(90 * 60_000)
  })

  it("conserve l'horloge monotone tant que Windows n'a pas redémarré", () => {
    const active = session()
    const sameBoot = active.startedAtBootWall!

    expect(remainingSessionMs(active, Date.now(), 30 * 60_000 + 1_000, sameBoot)).toBe(
      90 * 60_000,
    )
  })
})
