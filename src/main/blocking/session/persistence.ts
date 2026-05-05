import { promises as fsp } from 'node:fs'
import * as path from 'node:path'
import { app } from 'electron'
import type { Storage } from '@main/storage'
import type { ActiveSession, BlockingState } from '@shared/schemas'

const EMPTY_STATE: BlockingState = { profiles: [], history: [] }

export type BlockingPersistence = {
  readState: () => Promise<BlockingState>
  writeState: (s: BlockingState) => Promise<void>
  readActive: () => Promise<ActiveSession | null>
  writeActive: (s: ActiveSession) => Promise<void>
  clearActive: () => Promise<void>
}

export function createBlockingPersistence(storage: Storage): BlockingPersistence {
  return {
    async readState() {
      return (await storage.read('blocking')) ?? EMPTY_STATE
    },
    async writeState(state) {
      await storage.write('blocking', state)
    },
    async readActive() {
      return (await storage.read('blocking_active')) ?? null
    },
    async writeActive(s) {
      await storage.write('blocking_active', s)
    },
    async clearActive() {
      const file = path.join(app.getPath('userData'), 'nexus_blocking_active.json')
      await fsp.unlink(file).catch(() => {})
    },
  }
}
