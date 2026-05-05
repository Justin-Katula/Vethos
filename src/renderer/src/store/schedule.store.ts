import { create } from 'zustand'
import { nexus } from '@/lib/ipc'
import type { ScheduleEntry, ScheduleState, TimeRule } from '@shared/schemas'
import { hasOverlap } from '@/lib/schedule-selectors'

type SaveRuleDraft = {
  id?: string
  name: string
  color: string
  icon?: string
  linkedProfileId?: string | null
}

type SaveEntryDraft = {
  id?: string
  ruleId: string
  dayOfWeek: number
  startMinute: number
  endMinute: number
}

type ScheduleStore = {
  loaded: boolean
  rules: TimeRule[]
  entries: ScheduleEntry[]

  load: () => Promise<void>
  saveRule: (draft: SaveRuleDraft) => Promise<TimeRule>
  deleteRule: (id: string) => Promise<void>
  saveEntry: (draft: SaveEntryDraft) => Promise<ScheduleEntry>
  deleteEntry: (id: string) => Promise<void>
  /** Remplace l'intégralité du schedule (rules + entries). Utilisé par l'onboarding. */
  replaceAll: (rules: TimeRule[], entries: ScheduleEntry[]) => Promise<void>
}

function uuid(): string {
  return crypto.randomUUID()
}

async function persist(state: ScheduleState): Promise<void> {
  await nexus.storage.write('schedule', state)
}

export const useScheduleStore = create<ScheduleStore>((set, get) => ({
  loaded: false,
  rules: [],
  entries: [],

  async load() {
    const stored = await nexus.storage.read<ScheduleState>('schedule')
    if (stored) {
      set({ loaded: true, rules: stored.rules, entries: stored.entries })
    } else {
      set({ loaded: true, rules: [], entries: [] })
    }
  },

  async saveRule(draft) {
    const now = new Date().toISOString()
    const rules = get().rules.slice()
    let saved: TimeRule
    if (draft.id) {
      const i = rules.findIndex((r) => r.id === draft.id)
      if (i < 0) throw new Error(`Règle introuvable : ${draft.id}`)
      saved = {
        ...rules[i]!,
        name: draft.name,
        color: draft.color,
        icon: draft.icon,
        linkedProfileId: draft.linkedProfileId ?? null,
      }
      rules[i] = saved
    } else {
      saved = {
        id: uuid(),
        name: draft.name,
        color: draft.color,
        icon: draft.icon,
        linkedProfileId: draft.linkedProfileId ?? null,
        createdAt: now,
      }
      rules.push(saved)
    }
    set({ rules })
    await persist({ rules, entries: get().entries })
    return saved
  },

  async deleteRule(id) {
    const rules = get().rules.filter((r) => r.id !== id)
    const entries = get().entries.filter((e) => e.ruleId !== id)
    set({ rules, entries })
    await persist({ rules, entries })
  },

  async saveEntry(draft) {
    if (draft.endMinute <= draft.startMinute) {
      throw new Error('Fin doit être après le début')
    }
    if (!get().rules.some((r) => r.id === draft.ruleId)) {
      throw new Error('Règle inconnue')
    }
    const entries = get().entries.slice()
    if (
      hasOverlap(entries, {
        id: draft.id,
        dayOfWeek: draft.dayOfWeek,
        startMinute: draft.startMinute,
        endMinute: draft.endMinute,
      })
    ) {
      throw new Error('Chevauchement avec une autre entrée')
    }
    const now = new Date().toISOString()
    let saved: ScheduleEntry
    if (draft.id) {
      const i = entries.findIndex((e) => e.id === draft.id)
      if (i < 0) throw new Error(`Entrée introuvable : ${draft.id}`)
      saved = {
        ...entries[i]!,
        ruleId: draft.ruleId,
        dayOfWeek: draft.dayOfWeek,
        startMinute: draft.startMinute,
        endMinute: draft.endMinute,
      }
      entries[i] = saved
    } else {
      saved = {
        id: uuid(),
        ruleId: draft.ruleId,
        dayOfWeek: draft.dayOfWeek,
        startMinute: draft.startMinute,
        endMinute: draft.endMinute,
        createdAt: now,
      }
      entries.push(saved)
    }
    set({ entries })
    await persist({ rules: get().rules, entries })
    return saved
  },

  async deleteEntry(id) {
    const entries = get().entries.filter((e) => e.id !== id)
    set({ entries })
    await persist({ rules: get().rules, entries })
  },

  async replaceAll(rules, entries) {
    set({ rules, entries })
    await persist({ rules, entries })
  },
}))
