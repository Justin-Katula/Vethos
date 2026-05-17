import { promises as fs } from 'node:fs'
import { dirname } from 'node:path'

/**
 * Écrit `data` en JSON dans `filePath` de façon atomique.
 * Stratégie : écrire dans `<filePath>.tmp` puis `rename` (atomique sur NTFS).
 * Si le process crash entre les deux, le fichier original reste intact.
 */
export async function atomicWrite<T>(filePath: string, data: T): Promise<void> {
  await fs.mkdir(dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.tmp`
  const json = JSON.stringify(data, null, 2)
  await fs.writeFile(tmpPath, json, 'utf8')
  await fs.rename(tmpPath, filePath)
}

/**
 * Lit `filePath` et le parse comme JSON.
 * Retourne `null` si le fichier n'existe pas.
 * Lève une erreur si le JSON est invalide (à gérer par l'appelant).
 */
export async function atomicRead<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf8')
    return JSON.parse(content) as T
  } catch (err) {
    if (isNoEntryError(err)) {
      return null
    }
    throw err
  }
}

function isNoEntryError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'ENOENT'
}
