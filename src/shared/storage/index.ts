import { join } from 'node:path'
import { promises as fs } from 'node:fs'
import { atomicRead, atomicWrite, type Coffre } from './atomic'
import { STORAGE_SCHEMAS, type StorageKey } from '@shared/schemas'
import type { z } from 'zod'

export type Storage = ReturnType<typeof createStorage>

type SchemaFor<K extends StorageKey> = (typeof STORAGE_SCHEMAS)[K]
type ValueFor<K extends StorageKey> = z.infer<SchemaFor<K>>

/**
 * Crée une instance de storage rattachée à un répertoire de base.
 * En production : `app.getPath('userData')`.
 * En test : un tmpdir.
 *
 * `coffre` chiffre le contenu avant qu'il ne touche le disque. Sans lui, tout est
 * écrit en clair — c'est le cas en test, et c'était le cas partout avant que le
 * chiffrement n'existe. Les fichiers en clair restent lisibles et se chiffrent
 * d'eux-mêmes à leur prochaine écriture.
 */
export function createStorage(baseDir: string, coffre?: Coffre) {
  const fileFor = (key: StorageKey) => join(baseDir, `nexus_${key}.json`)

  return {
    async read<K extends StorageKey>(key: K): Promise<ValueFor<K> | null> {
      const filePath = fileFor(key)
      let raw: unknown | null
      try {
        raw = await atomicRead<unknown>(filePath, coffre)
      } catch (err) {
        if (err instanceof SyntaxError) {
          await fs.copyFile(filePath, `${filePath}.bak`).catch(() => undefined)
          return null
        }
        throw err
      }
      if (raw === null) return null

      const schema = STORAGE_SCHEMAS[key]
      const parsed = schema.safeParse(raw)
      if (!parsed.success) {
        // Sauvegarde le fichier corrompu en .bak et retourne null.
        // Pas de réparation auto : le caller décide.
        await fs.copyFile(filePath, `${filePath}.bak`).catch(() => undefined)
        return null
      }
      return parsed.data as ValueFor<K>
    },

    async write<K extends StorageKey>(key: K, data: ValueFor<K>): Promise<void> {
      const schema = STORAGE_SCHEMAS[key]
      // Throw si invalide — protège contre des bugs dans le main process.
      schema.parse(data)
      await atomicWrite(fileFor(key), data, coffre)
    },

    async exists(key: StorageKey): Promise<boolean> {
      try {
        await fs.access(fileFor(key))
        return true
      } catch {
        return false
      }
    },
  }
}
