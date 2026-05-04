import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import { StorageKeySchema, type StorageKey } from '@shared/schemas'
import type { Storage } from '@main/storage'

export function registerStorageHandlers(storage: Storage): void {
  ipcMain.handle(IPC_CHANNELS.STORAGE_READ, async (_event, rawKey: unknown) => {
    const key = StorageKeySchema.parse(rawKey) as StorageKey
    return storage.read(key)
  })

  ipcMain.handle(IPC_CHANNELS.STORAGE_WRITE, async (_event, rawKey: unknown, data: unknown) => {
    const key = StorageKeySchema.parse(rawKey) as StorageKey
    // La validation du payload est faite par storage.write via le schéma de la clé.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await storage.write(key, data as any)
  })

  ipcMain.handle(IPC_CHANNELS.STORAGE_EXISTS, async (_event, rawKey: unknown) => {
    const key = StorageKeySchema.parse(rawKey) as StorageKey
    return storage.exists(key)
  })
}
