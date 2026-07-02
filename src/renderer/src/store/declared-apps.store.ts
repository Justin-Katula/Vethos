import { create } from 'zustand'
import { vethos } from '@/lib/ipc'
import type { DeclaredApp, DeclaredAppsState } from '@shared/schemas'
import { assertStorageWrite } from '@/lib/storage-write'
import { useToastStore } from './toast.store'
import {
  normalizeStorageUserId,
  resolveStorageUserId,
  storageUserIdFromState,
} from './scoped-storage'

type SaveDraft = {
  id?: string
  name: string
  exeName: string
  linkedObjectiveId: string | null
}

type DeclaredAppsStore = {
  userId: string | null
  loaded: boolean
  apps: DeclaredApp[]
  setUserId: (userId?: string | null) => void
  reset: () => void
  load: (userId?: string) => Promise<void>
  saveApp: (draft: SaveDraft) => Promise<DeclaredApp>
  deleteApp: (id: string) => Promise<void>
}

const DEFAULT_DECLARED_APPS_STATE = {
  userId: null,
  loaded: false,
  apps: [],
}

function uuid(): string {
  return crypto.randomUUID()
}

async function persist(apps: DeclaredApp[], userId?: string): Promise<void> {
  if (!userId) return
  const state: DeclaredAppsState = { apps }
  try {
    const result = await vethos.storage.write('declared_apps', state, userId)
    assertStorageWrite(result, 'declared_apps')
  } catch (err) {
    useToastStore.getState().push({
      variant: 'error',
      title: 'Sauvegarde apps échouée',
      description: err instanceof Error ? err.message : String(err),
    })
    throw err
  }
}

export const useDeclaredAppsStore = create<DeclaredAppsStore>((set, get) => ({
  ...DEFAULT_DECLARED_APPS_STATE,

  setUserId(rawUserId) {
    const userId = normalizeStorageUserId(rawUserId) ?? null
    if (get().userId === userId) return
    set({ ...DEFAULT_DECLARED_APPS_STATE, userId })
  },

  reset() {
    set({ ...DEFAULT_DECLARED_APPS_STATE })
  },

  async load(rawUserId) {
    const userId = resolveStorageUserId(rawUserId, get())
    if (!userId) {
      get().reset()
      return
    }
    if (get().userId !== userId) {
      set({ ...DEFAULT_DECLARED_APPS_STATE, userId })
    }

    const stored = await vethos.storage.read<DeclaredAppsState>('declared_apps', userId)
    if (stored) {
      set({ userId, loaded: true, apps: stored.apps })
    } else {
      set({ userId, loaded: true, apps: [] })
    }
  },

  async saveApp(draft) {
    const userId = storageUserIdFromState(get())
    const apps = get().apps.slice()
    let saved: DeclaredApp
    if (draft.id) {
      const i = apps.findIndex((a) => a.id === draft.id)
      if (i < 0) throw new Error(`App déclarée introuvable : ${draft.id}`)
      saved = {
        ...apps[i]!,
        name: draft.name,
        exeName: draft.exeName,
        linkedObjectiveId: draft.linkedObjectiveId,
      }
      apps[i] = saved
    } else {
      saved = {
        id: uuid(),
        name: draft.name,
        exeName: draft.exeName,
        linkedObjectiveId: draft.linkedObjectiveId,
        createdAt: new Date().toISOString(),
      }
      apps.push(saved)
    }
    set({ apps })
    await persist(apps, userId)
    return saved
  },

  async deleteApp(id) {
    const userId = storageUserIdFromState(get())
    const apps = get().apps.filter((a) => a.id !== id)
    set({ apps })
    await persist(apps, userId)
  },
}))
