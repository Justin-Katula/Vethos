import type { Storage } from '../../storage'
import type { ActiveSession, BlockingState } from '@shared/schemas'

const EMPTY_STATE: BlockingState = {
  profiles: [],
  history: [],
  nextSessionPenaltyMinutes: 0,
}

export type BlockingPersistence = {
  setUserId: (userId?: string) => void
  getUserId: () => string | undefined
  readState: () => Promise<BlockingState>
  writeState: (s: BlockingState) => Promise<void>
  readActive: () => Promise<ActiveSession | null>
  writeActive: (s: ActiveSession) => Promise<void>
  clearActive: () => Promise<void>
}

function normalizeStorageUserId(userId: string | null | undefined): string | undefined {
  const trimmed = userId?.trim()
  return trimmed ? trimmed : undefined
}

export function createBlockingPersistence(storage: Storage): BlockingPersistence {
  let currentUserId: string | undefined

  return {
    setUserId(userId) {
      currentUserId = normalizeStorageUserId(userId)
    },
    getUserId() {
      return currentUserId
    },
    async readState() {
      const [blocking, history] = await Promise.all([
        storage.read('blocking', currentUserId),
        storage.read('blocking_history', currentUserId),
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
        await storage.write('blocking_history', { history: blocking.history }, currentUserId)
        await storage.write(
          'blocking',
          {
            profiles: blocking.profiles,
            history: [],
            nextSessionPenaltyMinutes: merged.nextSessionPenaltyMinutes,
          },
          currentUserId,
        )
      }
      return merged
    },
    async writeState(state) {
      await Promise.all([
        storage.write(
          'blocking',
          {
            profiles: state.profiles,
            history: [],
            nextSessionPenaltyMinutes: state.nextSessionPenaltyMinutes ?? 0,
          },
          currentUserId,
        ),
        storage.write('blocking_history', { history: state.history }, currentUserId),
      ])
    },
    async readActive() {
      const scoped = await storage.read('blocking_active', currentUserId)
      if (scoped || currentUserId === undefined) return scoped ?? null

      // Le miroir global permet au service Windows de retrouver la session
      // avant même que l'interface ait renvoyé l'identité Clerk après un reboot.
      const recovery = await storage.read('blocking_active')
      return recovery?.userId === currentUserId ? recovery : null
    },
    async writeActive(s) {
      if (currentUserId === undefined) {
        await storage.write('blocking_active', s)
        return
      }
      await Promise.all([
        storage.write('blocking_active', s, currentUserId),
        storage.write('blocking_active', s),
      ])
    },
    async clearActive() {
      if (currentUserId === undefined) {
        await storage.remove('blocking_active')
        return
      }
      await Promise.all([
        storage.remove('blocking_active', currentUserId),
        storage.remove('blocking_active'),
      ])
    },
  }
}
