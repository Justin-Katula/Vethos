import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import { StorageKeySchema, type StorageKey } from '@shared/schemas'
import type { Storage } from '@service/storage'
import log from '@main/logging/setup'
import { parseOptionalStorageUserId, resolveAuthorizedStorageUserId } from './storage-user-scope'

function parseOptionalUserId(rawUserId: unknown): string | undefined {
  return parseOptionalStorageUserId(rawUserId)
}

export function registerStorageHandlers(storage: Storage, getCurrentUserId?: () => string | undefined): void {
  function authorizedUserId(rawUserId: unknown): string | undefined {
    const requested = parseOptionalUserId(rawUserId)
    if (!getCurrentUserId) return requested
    return resolveAuthorizedStorageUserId(requested, getCurrentUserId())
  }

  ipcMain.handle(IPC_CHANNELS.STORAGE_READ, async (_event, rawKey: unknown, rawUserId?: unknown) => {
    const key = StorageKeySchema.parse(rawKey) as StorageKey
    const userId = authorizedUserId(rawUserId)
    return storage.read(key, userId)
  })

  ipcMain.handle(
    IPC_CHANNELS.STORAGE_WRITE,
    async (_event, rawKey: unknown, data: unknown, rawUserId?: unknown) => {
      const key = StorageKeySchema.parse(rawKey) as StorageKey
      const userId = authorizedUserId(rawUserId)
      // La validation du payload est faite par storage.write via le schéma de la clé ;
      // on transite par `as never` pour préserver le typecheck strict côté Storage.write
      // (qui a une signature surchargée par clé).
      try {
        await storage.write(key, data as never, userId)
        return { ok: true as const }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        log.error('storage write failed', { key, message, err })
        return { ok: false as const, error: message }
      }
    },
  )

  ipcMain.handle(IPC_CHANNELS.STORAGE_EXISTS, async (_event, rawKey: unknown, rawUserId?: unknown) => {
    const key = StorageKeySchema.parse(rawKey) as StorageKey
    const userId = authorizedUserId(rawUserId)
    return storage.exists(key, userId)
  })
}
