import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { atomicWrite, atomicRead } from './atomic'

describe('atomic storage', () => {
  let dir: string

  beforeEach(async () => {
    dir = await fs.mkdtemp(join(tmpdir(), 'nexus-test-'))
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

describe('chiffrement au repos', () => {
  let dir: string

  // Un coffre de test : pas du vrai chiffrement, mais la meme forme — une chaine
  // qui entre, une chaine illisible qui sort, et l'inverse.
  const coffre = {
    chiffrer: (clair: string) => Buffer.from(clair, 'utf8').toString('base64'),
    dechiffrer: (chiffre: string) => Buffer.from(chiffre, 'base64').toString('utf8'),
  }

  beforeEach(async () => {
    dir = await fs.mkdtemp(join(tmpdir(), 'vethos-coffre-'))
  })
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('le fichier sur le disque ne contient plus les données en clair', async () => {
    const chemin = join(dir, 'secret.json')
    await atomicWrite(chemin, { objectif: 'quitter mon travail' }, coffre)

    const surLeDisque = await fs.readFile(chemin, 'utf8')
    expect(surLeDisque).not.toContain('quitter mon travail')
    expect(surLeDisque).not.toContain('objectif')

    expect(await atomicRead(chemin, coffre)).toEqual({ objectif: 'quitter mon travail' })
  })

  it('lit encore les fichiers en clair écrits par une version précédente', async () => {
    // La migration ne doit rien demander a l'utilisateur et ne rien perdre.
    const chemin = join(dir, 'ancien.json')
    await atomicWrite(chemin, { garde: 'moi' })

    expect(await atomicRead(chemin, coffre)).toEqual({ garde: 'moi' })

    // Et la prochaine ecriture le chiffre.
    await atomicWrite(chemin, { garde: 'moi' }, coffre)
    expect(await fs.readFile(chemin, 'utf8')).not.toContain('moi')
  })

  it('un fichier venu d’ailleurs est traité comme corrompu, pas comme un plantage', async () => {
    const chemin = join(dir, 'etranger.json')
    await atomicWrite(chemin, { a: 1 }, coffre)

    const autreCoffre = {
      chiffrer: (c: string) => c,
      dechiffrer: () => {
        throw new Error('mauvaise clé')
      },
    }
    // SyntaxError : c'est ce que la couche du dessus sait mettre de cote en .bak.
    await expect(atomicRead(chemin, autreCoffre)).rejects.toThrow(SyntaxError)
    await expect(atomicRead(chemin)).rejects.toThrow(SyntaxError)
  })
})
