import { join } from 'node:path'
import { promises as fs } from 'node:fs'
import { atomicRead, atomicWrite } from './atomic'
import { STORAGE_SCHEMAS, type StorageKey } from '@shared/schemas'
import type { z } from 'zod'

export type Storage = ReturnType<typeof createStorage>

type SchemaFor<K extends StorageKey> = (typeof STORAGE_SCHEMAS)[K]
type ValueFor<K extends StorageKey> = z.infer<SchemaFor<K>>

/**
 * Crée une instance de storage rattachée à un répertoire de base.
 * En production : `app.getPath('userData')`.
 * En test : un tmpdir.
 */
export function createStorage(baseDir: string) {
  const fileFor = (key: StorageKey, userId?: string) =>
    join(baseDir, userId === undefined ? `vethos_${key}.json` : `vethos_${userId}_${key}.json`)

  return {
    async read<K extends StorageKey>(key: K, userId?: string): Promise<ValueFor<K> | null> {
      const filePath = fileFor(key, userId)
      let raw: unknown | null
      try {
        raw = await atomicRead<unknown>(filePath)
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

    async write<K extends StorageKey>(key: K, data: ValueFor<K>, userId?: string): Promise<void> {
      const schema = STORAGE_SCHEMAS[key]
      // Throw si invalide — protège contre des bugs dans le main process.
      schema.parse(data)
      await atomicWrite(fileFor(key, userId), data)
    },

    async exists(key: StorageKey, userId?: string): Promise<boolean> {
      try {
        await fs.access(fileFor(key, userId))
        return true
      } catch {
        return false
      }
    },

    async remove(key: StorageKey, userId?: string): Promise<void> {
      await fs.unlink(fileFor(key, userId)).catch(() => undefined)
    },
  }
}
