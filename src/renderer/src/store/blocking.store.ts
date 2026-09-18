import { create } from 'zustand'
import { nexus } from '@/lib/ipc'

/** État en lecture seule du bloc de planning actuellement appliqué. */
export type SessionState = {
  active: boolean
  blockedAppIds: string[]
  endsAt: number | null
}

const SESSION_INACTIVE: SessionState = { active: false, blockedAppIds: [], endsAt: null }

type BlockingStore = {
  loaded: boolean
  session: SessionState
  load: () => Promise<void>
  setSession: (session: SessionState) => void
}

/**
 * La page Blocage gère le catalogue d'applications. Elle ne crée plus de
 * minuterie autonome : la seule session vient d'une tâche confirmée.
 */
export const useBlockingStore = create<BlockingStore>((set) => ({
  loaded: false,
  session: SESSION_INACTIVE,

  async load() {
    const session = await nexus.blocking.getSession()
    set({ loaded: true, session: session ?? SESSION_INACTIVE })
  },

  setSession(session) {
    set({ session })
  },
}))
