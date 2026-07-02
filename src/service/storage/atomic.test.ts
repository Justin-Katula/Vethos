import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { atomicWrite, atomicRead } from './atomic'

describe('atomic storage', () => {
  let dir: string

  beforeEach(async () => {
    dir = await fs.mkdtemp(join(tmpdir(), 'vethos-test-'))
  })

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('writes and reads back JSON data', async () => {
    const file = join(dir, 'data.json')
    await atomicWrite(file, { hello: 'world' })
    const result = await atomicRead<{ hello: string }>(file)
    expect(result).toEqual({ hello: 'world' })
  })

  it('returns null when file does not exist', async () => {
    const result = await atomicRead<unknown>(join(dir, 'missing.json'))
    expect(result).toBeNull()
  })

  it('overwrites existing data atomically', async () => {
    const file = join(dir, 'data.json')
    await atomicWrite(file, { v: 1 })
    await atomicWrite(file, { v: 2 })
    const result = await atomicRead<{ v: number }>(file)
    expect(result).toEqual({ v: 2 })
  })

  it('handles concurrent writes without sharing a temp path', async () => {
    const file = join(dir, 'data.json')
    await Promise.all(
      Array.from({ length: 20 }, (_, v) => atomicWrite(file, { v })),
    )
    const result = await atomicRead<{ v: number }>(file)
    expect(typeof result?.v).toBe('number')
    const entries = await fs.readdir(dir)
    expect(entries.filter((e) => e.endsWith('.tmp'))).toHaveLength(0)
  })

  it('does not leave .tmp files after successful write', async () => {
    const file = join(dir, 'data.json')
    await atomicWrite(file, { ok: true })
    const entries = await fs.readdir(dir)
    expect(entries.filter((e) => e.endsWith('.tmp'))).toHaveLength(0)
  })

  it('preserves the original file if rename fails (simulated)', async () => {
    const file = join(dir, 'data.json')
    await atomicWrite(file, { v: 'original' })
    // Simule un .tmp orphelin (crash après écriture, avant rename)
    await fs.writeFile(`${file}.tmp`, '{"v":"corrupted"}')
    // Le fichier original ne doit pas être affecté
    const result = await atomicRead<{ v: string }>(file)
    expect(result).toEqual({ v: 'original' })
  })
})
