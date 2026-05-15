import { create } from 'zustand'
import { nexus } from '@/lib/ipc'
import type { DeclaredApp, DeclaredAppsState } from '@shared/schemas'
import { assertStorageWrite } from '@/lib/storage-write'
import { useToastStore } from './toast.store'

type SaveDraft = {
  id?: string
  name: string
  exeName: string
  linkedObjectiveId: string | null
}

type DeclaredAppsStore = {
  loaded: boolean
  apps: DeclaredApp[]
  load: () => Promise<void>
  saveApp: (draft: SaveDraft) => Promise<DeclaredApp>
  deleteApp: (id: string) => Promise<void>
}

function uuid(): string {
  return crypto.randomUUID()
}

async function persist(apps: DeclaredApp[]): Promise<void> {
  const state: DeclaredAppsState = { apps }
  const result = await nexus.storage.write('declared_apps', state)
  try {
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
  loaded: false,
  apps: [],

  async load() {
    const stored = await nexus.storage.read<DeclaredAppsState>('declared_apps')
    if (stored) {
      set({ loaded: true, apps: stored.apps })
    } else {
      set({ loaded: true, apps: [] })
    }
  },

  async saveApp(draft) {
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
    await persist(apps)
    return saved
  },

  async deleteApp(id) {
    const apps = get().apps.filter((a) => a.id !== id)
    set({ apps })
    await persist(apps)
  },
}))
