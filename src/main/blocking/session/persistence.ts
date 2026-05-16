import { promises as fsp } from 'node:fs'
import * as path from 'node:path'
import { app } from 'electron'
import type { Storage } from '@main/storage'
import type { ActiveSession, BlockingState } from '@shared/schemas'

const EMPTY_STATE: BlockingState = {
  profiles: [],
  history: [],
  nextSessionPenaltyMinutes: 0,
}

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
      const [blocking, history] = await Promise.all([
        storage.read('blocking'),
        storage.read('blocking_history'),
      ])
      if (!blocking) {
        return history
          ? { profiles: [], history: history.history, nextSessionPenaltyMinutes: 0 }
          : EMPTY_STATE
      }
      const merged = {
        profiles: blocking.profiles,
        history: history?.history ?? blocking.history ?? [],
        nextSessionPenaltyMinutes: blocking.nextSessionPenaltyMinutes ?? 0,
      }
      if (!history && blocking.history.length > 0) {
        await storage.write('blocking_history', { history: blocking.history })
        await storage.write('blocking', {
          profiles: blocking.profiles,
          history: [],
          nextSessionPenaltyMinutes: merged.nextSessionPenaltyMinutes,
        })
      }
      return merged
    },
    async writeState(state) {
      await Promise.all([
        storage.write('blocking', {
          profiles: state.profiles,
          history: [],
          nextSessionPenaltyMinutes: state.nextSessionPenaltyMinutes ?? 0,
        }),
        storage.write('blocking_history', { history: state.history }),
      ])
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
