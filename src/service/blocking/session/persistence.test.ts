import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStorage } from '../../storage'
import { createBlockingPersistence } from './persistence'
import type { ActiveSession, BlockingProfile } from '@shared/schemas'

const PROFILE: BlockingProfile = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Reprise',
  mode: 'blocklist',
  blockedSites: [],
  blockedProcesses: ['notepad.exe'],
  blockedNetworkApps: [],
  unlockPolicy: { type: 'none' },
  createdAt: '2026-06-21T20:00:00.000Z',
}

const ACTIVE: ActiveSession = {
  id: '22222222-2222-4222-8222-222222222222',
  userId: 'user_123',
  profileId: PROFILE.id,
  profileSnapshot: PROFILE,
  startedAt: '2026-06-21T22:00:00.000Z',
  endsAt: '2026-06-22T02:00:00.000Z',
  startedAtWall: new Date('2026-06-21T22:00:00.000Z').getTime(),
  startedAtMono: 1,
  durationMinutes: 240,
  unlockState: { phase: 'locked' },
  appliedFirewallRules: [],
}

describe('blocking persistence recovery', () => {
  let dir: string

  beforeEach(async () => {
    dir = await fs.mkdtemp(join(tmpdir(), 'vethos-blocking-recovery-'))
  })

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('écrit un miroir global lisible par le service avant la reconnexion utilisateur', async () => {
    const storage = createStorage(dir)
    const scoped = createBlockingPersistence(storage)
    scoped.setUserId('user_123')

    await scoped.writeActive(ACTIVE)

    const bootRecovery = createBlockingPersistence(storage)
    expect(await bootRecovery.readActive()).toEqual(ACTIVE)
    expect(await storage.read('blocking_active', 'user_123')).toEqual(ACTIVE)
  })

  it('supprime ensemble la session utilisateur et son miroir de reprise', async () => {
    const storage = createStorage(dir)
    const persistence = createBlockingPersistence(storage)
    persistence.setUserId('user_123')
    await persistence.writeActive(ACTIVE)

    await persistence.clearActive()

    expect(await storage.read('blocking_active', 'user_123')).toBeNull()
    expect(await storage.read('blocking_active')).toBeNull()
  })
})
