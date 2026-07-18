import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createStorage } from './index'

describe('storage with Zod validation', () => {
  let dir: string

  beforeEach(async () => {
    dir = await fs.mkdtemp(join(tmpdir(), 'nexus-store-'))
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

  it('returns null and creates .bak when file is invalid', async () => {
    const storage = createStorage(dir)
    const file = join(dir, 'nexus_settings.json')
    await fs.writeFile(file, '{"username": 123}', 'utf8') // type invalide
    const result = await storage.read('settings')
    expect(result).toBeNull()
    expect(await fs.readFile(`${file}.bak`, 'utf8')).toBe('{"username": 123}')
  })

  it('returns null and creates .bak when JSON is malformed', async () => {
    const storage = createStorage(dir)
    const file = join(dir, 'nexus_settings.json')
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
})
