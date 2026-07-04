import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fsp } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { migrateBlockingData } from './migrate-blocking-data'

describe('migrateBlockingData', () => {
  let base: string
  let fromDir: string
  let toDir: string

  beforeEach(async () => {
    base = await fsp.mkdtemp(join(tmpdir(), 'vethos-migrate-'))
    fromDir = join(base, 'from')
    toDir = join(base, 'to')
    await fsp.mkdir(fromDir, { recursive: true })
  })
  afterEach(async () => {
    await fsp.rm(base, { recursive: true, force: true })
  })

  it('copie un fichier de blocage absent de la cible', async () => {
    await fsp.writeFile(join(fromDir, 'vethos_blocking.json'), '{"profiles":[]}', 'utf8')
    await migrateBlockingData(fromDir, toDir)
    expect(await fsp.readFile(join(toDir, 'vethos_blocking.json'), 'utf8')).toBe('{"profiles":[]}')
  })

  it("n'écrase pas un fichier déjà présent dans la cible", async () => {
    await fsp.writeFile(join(fromDir, 'vethos_blocking.json'), 'NOUVEAU', 'utf8')
    await fsp.mkdir(toDir, { recursive: true })
    await fsp.writeFile(join(toDir, 'vethos_blocking.json'), 'EXISTANT', 'utf8')
    await migrateBlockingData(fromDir, toDir)
    expect(await fsp.readFile(join(toDir, 'vethos_blocking.json'), 'utf8')).toBe('EXISTANT')
  })

  it('ignore un fichier absent de la source sans erreur', async () => {
    await expect(migrateBlockingData(fromDir, toDir)).resolves.toBeUndefined()
    expect(await fsp.readdir(toDir)).toEqual([])
  })

  it("crée le répertoire cible s'il n'existe pas", async () => {
    await fsp.writeFile(join(fromDir, 'hosts.vethos.backup'), 'backup', 'utf8')
    await migrateBlockingData(fromDir, toDir)
    expect(await fsp.readFile(join(toDir, 'hosts.vethos.backup'), 'utf8')).toBe('backup')
  })

  it('migre les 4 fichiers de blocage connus, pas le staging', async () => {
    for (const name of [
      'vethos_blocking.json',
      'vethos_blocking_history.json',
      'vethos_blocking_active.json',
      'hosts.vethos.backup',
      'hosts.vethos.staging',
    ]) {
      await fsp.writeFile(join(fromDir, name), name, 'utf8')
    }
    await migrateBlockingData(fromDir, toDir)
    expect((await fsp.readdir(toDir)).sort()).toEqual(
      [
        'hosts.vethos.backup',
        'vethos_blocking.json',
        'vethos_blocking_active.json',
        'vethos_blocking_history.json',
      ].sort(),
    )
  })
})
