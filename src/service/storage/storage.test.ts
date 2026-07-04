import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createStorage } from './index'

describe('storage with Zod validation', () => {
  let dir: string

  beforeEach(async () => {
    dir = await fs.mkdtemp(join(tmpdir(), 'vethos-store-'))
  })

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('writes and reads valid settings', async () => {
    const storage = createStorage(dir)
    await storage.write('settings', { username: 'obed', savedAt: '2026-05-02T10:00:00.000Z' })
    const result = await storage.read('settings')
    expect(result).toEqual({ username: 'obed', savedAt: '2026-05-02T10:00:00.000Z' })
  })

  it('returns null when no file exists yet', async () => {
    const storage = createStorage(dir)
    const result = await storage.read('settings')
    expect(result).toBeNull()
  })

  it('exists() reflects file presence', async () => {
    const storage = createStorage(dir)
    expect(await storage.exists('settings')).toBe(false)
    await storage.write('settings', { username: 'a' })
    expect(await storage.exists('settings')).toBe(true)
  })

  it('uses user-scoped filenames when userId is provided', async () => {
    const storage = createStorage(dir)
    await storage.write('settings', { username: 'scoped' }, 'user_123')

    expect(await storage.read('settings')).toBeNull()
    expect(await storage.read('settings', 'user_123')).toEqual({ username: 'scoped' })
    expect(await storage.exists('settings')).toBe(false)
    expect(await storage.exists('settings', 'user_123')).toBe(true)
    expect(await fs.readFile(join(dir, 'vethos_user_123_settings.json'), 'utf8')).toContain(
      'scoped',
    )
  })

  it('returns null and creates .bak when file is invalid', async () => {
    const storage = createStorage(dir)
    const file = join(dir, 'vethos_settings.json')
    await fs.writeFile(file, '{"username": 123}', 'utf8') // type invalide
    const result = await storage.read('settings')
    expect(result).toBeNull()
    expect(await fs.readFile(`${file}.bak`, 'utf8')).toBe('{"username": 123}')
  })

  it('returns null and creates .bak when JSON is malformed', async () => {
    const storage = createStorage(dir)
    const file = join(dir, 'vethos_settings.json')
    await fs.writeFile(file, '{"username": "obed"} trailing', 'utf8')
    const result = await storage.read('settings')
    expect(result).toBeNull()
    expect(await fs.readFile(`${file}.bak`, 'utf8')).toBe('{"username": "obed"} trailing')
  })

  it('rejects writes that fail Zod validation', async () => {
    const storage = createStorage(dir)
    // username dépasse 100 chars
    const longName = 'x'.repeat(200)
    await expect(storage.write('settings', { username: longName })).rejects.toThrow()
  })

  it('persists app-block explanations with their focus context and decision', async () => {
    const storage = createStorage(dir)
    await storage.write(
      'app_block_explanations',
      {
        entries: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            createdAt: '2026-06-20T18:15:30.000Z',
            localDate: '2026-06-20',
            localTime: '12:15:30',
            processName: 'discord.exe',
            appName: 'discord',
            explanation: 'Je dois récupérer le fichier envoyé par mon professeur.',
            sessionId: '22222222-2222-4222-8222-222222222222',
            profileId: '33333333-3333-4333-8333-333333333333',
            sessionName: 'Vethos auto - Travail final',
            mode: 'work',
            focusKind: 'task',
            focusLabel: 'Travail final',
            taskId: '44444444-4444-4444-8444-444444444444',
            taskTitle: 'Travail final',
            decision: 'denied',
            reason: 'Le besoin n’est pas suffisamment urgent.',
            necessityScore: 6,
            credibilityScore: 8,
            urgencyScore: 4,
            allowMinutes: 0,
          },
        ],
      },
      'user_123',
    )

    const result = await storage.read('app_block_explanations', 'user_123')
    expect(result?.entries[0]).toMatchObject({
      processName: 'discord.exe',
      localDate: '2026-06-20',
      localTime: '12:15:30',
      focusLabel: 'Travail final',
      decision: 'denied',
    })
  })
})
