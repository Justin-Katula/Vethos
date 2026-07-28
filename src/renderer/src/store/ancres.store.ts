import { create } from 'zustand'
import { nexus } from '@/lib/ipc'
import type { Ancre, AncresState } from '@shared/schemas'
import { assertStorageWrite } from '@/lib/storage-write'
import { useToastStore } from './toast.store'

type AncresStore = {
  loaded: boolean
  ancres: Ancre[]

  load: () => Promise<void>
  saveAncre: (draft: { id?: string; name: string; color: string; trigger: string; anchorMinute: number; daysOfWeek: number[]; normalMaxMinutes: number }) => Promise<Ancre>
  deleteAncre: (id: string) => Promise<void>
}

const DEFAULT_STATE = {
  loaded: false,
  ancres: [] as Ancre[],
}

function computeMinimum(normalMax: number): number {
  return Math.max(20, Math.round(normalMax * 0.4))
}

export const useAncresStore = create<AncresStore>((set, get) => ({
  ...DEFAULT_STATE,

  async load() {
    const state = await nexus.storage.read<AncresState>('ancres')
    set({ loaded: true, ancres: state?.ancres ?? [] })
  },

  async saveAncre(draft) {
    const ancres = get().ancres.slice()
    let saved: Ancre
    const minimumMinutes = computeMinimum(draft.normalMaxMinutes)

    if (draft.id) {
      const i = ancres.findIndex((a) => a.id === draft.id)
      if (i < 0) throw new Error(`Ancre introuvable : ${draft.id}`)
      saved = {
        ...ancres[i]!,
        name: draft.name,
        color: draft.color,
        trigger: draft.trigger,
        anchorMinute: draft.anchorMinute,
        daysOfWeek: draft.daysOfWeek,
        normalMaxMinutes: draft.normalMaxMinutes,
        minimumMinutes,
      }
      ancres[i] = saved
    } else {
      saved = {
        id: crypto.randomUUID(),
        name: draft.name,
        color: draft.color,
        trigger: draft.trigger,
        anchorMinute: draft.anchorMinute,
        daysOfWeek: draft.daysOfWeek,
        normalMaxMinutes: draft.normalMaxMinutes,
        minimumMinutes,
        createdAt: new Date().toISOString(),
      }
      ancres.push(saved)
    }

    // Critère 6 : deux ancres ne peuvent jamais occuper le même créneau.
    for (const a of ancres) {
      if (a.id === saved.id) continue
      for (const day of saved.daysOfWeek) {
        if (a.daysOfWeek.includes(day) && a.anchorMinute === saved.anchorMinute) {
          throw new Error(`Conflit d'heure avec "${a.name}" le même jour à la même heure.`)
        }
      }
    }

    set({ ancres })
    const result = await nexus.storage.write<AncresState>('ancres', { ancres })
    assertStorageWrite(result, 'ancres')
    return saved
  },

  async deleteAncre(id) {
    const ancres = get().ancres.filter((a) => a.id !== id)
    set({ ancres })
    const result = await nexus.storage.write<AncresState>('ancres', { ancres })
    assertStorageWrite(result, 'ancres')
  },
}))

void useToastStore
