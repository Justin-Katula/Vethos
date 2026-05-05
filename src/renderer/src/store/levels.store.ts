import { create } from 'zustand'
import { nexus } from '@/lib/ipc'
import type {
  BlockingHistoryEntry,
  FreeTimeBank,
  FreeTimeEntry,
  LevelsState,
  Objective,
  TimeRule,
} from '@shared/schemas'
import { computeCredits } from '@/lib/credit-engine'

type SaveObjectiveDraft = {
  id?: string
  name: string
  description?: string
  color: string
  icon?: string
  linkedRuleIds?: string[]
}

type LevelsStore = {
  loaded: boolean
  objectives: Objective[]
  freeTime: FreeTimeBank
  lastProcessedSessionId: string | null

  load: () => Promise<void>
  saveObjective: (draft: SaveObjectiveDraft) => Promise<Objective>
  deleteObjective: (id: string) => Promise<void>
  /** Débit de la banque. Refuse si balance < minutes. */
  spendFreeTime: (minutes: number, reason: string) => Promise<void>
  /** Réconcilie le store avec l'historique de blocage. Idempotent. */
  reconcileWithHistory: (
    history: BlockingHistoryEntry[],
    rules: TimeRule[],
  ) => Promise<void>
}

function uuid(): string {
  return crypto.randomUUID()
}

const EMPTY_BANK: FreeTimeBank = { balanceMinutes: 0, entries: [] }

async function persist(state: LevelsState): Promise<void> {
  await nexus.storage.write('levels', state)
}

export const useLevelsStore = create<LevelsStore>((set, get) => ({
  loaded: false,
  objectives: [],
  freeTime: EMPTY_BANK,
  lastProcessedSessionId: null,

  async load() {
    const stored = await nexus.storage.read<LevelsState>('levels')
    if (stored) {
      set({
        loaded: true,
        objectives: stored.objectives,
        freeTime: stored.freeTime,
        lastProcessedSessionId: stored.lastProcessedSessionId,
      })
    } else {
      set({
        loaded: true,
        objectives: [],
        freeTime: EMPTY_BANK,
        lastProcessedSessionId: null,
      })
    }
  },

  async saveObjective(draft) {
    const now = new Date().toISOString()
    const objectives = get().objectives.slice()
    let saved: Objective
    if (draft.id) {
      const i = objectives.findIndex((o) => o.id === draft.id)
      if (i < 0) throw new Error(`Objectif introuvable : ${draft.id}`)
      saved = {
        ...objectives[i]!,
        name: draft.name,
        description: draft.description,
        color: draft.color,
        icon: draft.icon,
        linkedRuleIds: draft.linkedRuleIds ?? objectives[i]!.linkedRuleIds,
      }
      objectives[i] = saved
    } else {
      saved = {
        id: uuid(),
        name: draft.name,
        description: draft.description,
        color: draft.color,
        icon: draft.icon,
        linkedRuleIds: draft.linkedRuleIds ?? [],
        xpMinutes: 0,
        createdAt: now,
      }
      objectives.push(saved)
    }
    set({ objectives })
    await persist({
      objectives,
      freeTime: get().freeTime,
      lastProcessedSessionId: get().lastProcessedSessionId,
    })
    return saved
  },

  async deleteObjective(id) {
    const objectives = get().objectives.filter((o) => o.id !== id)
    set({ objectives })
    await persist({
      objectives,
      freeTime: get().freeTime,
      lastProcessedSessionId: get().lastProcessedSessionId,
    })
  },

  async spendFreeTime(minutes, reason) {
    if (!Number.isFinite(minutes) || minutes <= 0) {
      throw new Error('Minutes invalides')
    }
    const bank = get().freeTime
    if (bank.balanceMinutes < minutes) {
      throw new Error(
        `Solde insuffisant (${bank.balanceMinutes} min disponibles, ${minutes} demandées)`,
      )
    }
    const entry: FreeTimeEntry = {
      id: uuid(),
      at: new Date().toISOString(),
      deltaMinutes: -Math.round(minutes),
      reason: reason.slice(0, 200),
    }
    const newBank: FreeTimeBank = {
      balanceMinutes: bank.balanceMinutes - Math.round(minutes),
      entries: [...bank.entries, entry].slice(-500),
    }
    set({ freeTime: newBank })
    await persist({
      objectives: get().objectives,
      freeTime: newBank,
      lastProcessedSessionId: get().lastProcessedSessionId,
    })
  },

  async reconcileWithHistory(history, rules) {
    const out = computeCredits({
      history,
      rules,
      objectives: get().objectives,
      lastProcessedSessionId: get().lastProcessedSessionId,
    })

    // No new work to do
    if (
      out.objectiveDeltas.size === 0 &&
      out.freeTimeDelta === 0 &&
      out.newCursorSessionId === get().lastProcessedSessionId
    ) {
      return
    }

    const objectives = get().objectives.map((o) => {
      const delta = out.objectiveDeltas.get(o.id)
      if (!delta) return o
      return { ...o, xpMinutes: o.xpMinutes + Math.round(delta) }
    })

    const bank = get().freeTime
    const newBank: FreeTimeBank = {
      balanceMinutes: bank.balanceMinutes + out.freeTimeDelta,
      entries: [...bank.entries, ...out.freeTimeEntries].slice(-500),
    }

    const next: LevelsState = {
      objectives,
      freeTime: newBank,
      lastProcessedSessionId: out.newCursorSessionId,
    }

    set(next)
    await persist(next)
  },
}))
