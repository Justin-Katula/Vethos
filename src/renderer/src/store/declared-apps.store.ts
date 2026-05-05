import { create } from 'zustand'
import { nexus } from '@/lib/ipc'
import type { DeclaredApp, DeclaredAppsState } from '@shared/schemas'

type SaveDraft = {
  id?: string
  name: string
  exeName: string
  linkedObjectiveId: string | null
  xpRatio: number
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
  await nexus.storage.write('declared_apps', state)
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
        xpRatio: draft.xpRatio,
      }
      apps[i] = saved
    } else {
      saved = {
        id: uuid(),
        name: draft.name,
        exeName: draft.exeName,
        linkedObjectiveId: draft.linkedObjectiveId,
        xpRatio: draft.xpRatio,
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
