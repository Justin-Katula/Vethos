import { create } from 'zustand'
import { nexus } from '@/lib/ipc'
import type {
  BlockingHistoryEntry,
  DeclaredApp,
  DeclaredAppUsageEntry,
  FreeTimeBank,
  FreeTimeEntry,
  LevelsState,
  Objective,
  TimeRule,
} from '@shared/schemas'
import { computeCredits, computeCreditsFromAppUsage } from '@/lib/credit-engine'

type SaveObjectiveDraft = {
  id?: string
  name: string
  description?: string
  color: string
  icon?: string
  linkedRuleIds?: string[]
}

/** Événement émis quand une réconciliation crédite réellement quelque chose. */
export type CreditEvent = {
  freeTimeDelta: number
  objectiveDeltas: Array<{ objectiveId: string; minutes: number }>
  at: string
}

type LevelsStore = {
  loaded: boolean
  objectives: Objective[]
  freeTime: FreeTimeBank
  lastProcessedSessionId: string | null
  lastProcessedAppUsageByApp: Record<string, string | null>
  /** Dernier événement de crédit (consommé par FloatingCredit + toasts). */
  lastCreditEvent: CreditEvent | null

  load: () => Promise<void>
  saveObjective: (draft: SaveObjectiveDraft) => Promise<Objective>
  deleteObjective: (id: string) => Promise<void>
  spendFreeTime: (minutes: number, reason: string) => Promise<void>
  reconcileWithHistory: (
    history: BlockingHistoryEntry[],
    rules: TimeRule[],
  ) => Promise<void>
  reconcileWithAppUsage: (
    apps: DeclaredApp[],
    usageEntries: DeclaredAppUsageEntry[],
  ) => Promise<void>
  reconcileFully: (args: {
    history: BlockingHistoryEntry[]
    rules: TimeRule[]
    apps: DeclaredApp[]
    usageEntries: DeclaredAppUsageEntry[]
  }) => Promise<void>
  /** Marque l'événement de crédit comme consommé. */
  consumeCreditEvent: () => void
}

function uuid(): string {
  return crypto.randomUUID()
}

const EMPTY_BANK: FreeTimeBank = { balanceMinutes: 0, entries: [] }

async function persist(state: LevelsStore): Promise<void> {
  const payload: LevelsState = {
    objectives: state.objectives,
    freeTime: state.freeTime,
    lastProcessedSessionId: state.lastProcessedSessionId,
    lastProcessedAppUsageByApp: state.lastProcessedAppUsageByApp,
  }
  await nexus.storage.write('levels', payload)
}

function buildMinutesByDayMap(
  entries: DeclaredAppUsageEntry[],
): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>()
  for (const e of entries) {
    const m = out.get(e.appId) ?? new Map<string, number>()
    m.set(e.date, (m.get(e.date) ?? 0) + e.minutes)
    out.set(e.appId, m)
  }
  return out
}

export const useLevelsStore = create<LevelsStore>((set, get) => ({
  loaded: false,
  objectives: [],
  freeTime: EMPTY_BANK,
  lastProcessedSessionId: null,
  lastProcessedAppUsageByApp: {},
  lastCreditEvent: null,

  async load() {
    const stored = await nexus.storage.read<LevelsState>('levels')
    if (stored) {
      set({
        loaded: true,
        objectives: stored.objectives,
        freeTime: stored.freeTime,
        lastProcessedSessionId: stored.lastProcessedSessionId,
        lastProcessedAppUsageByApp: stored.lastProcessedAppUsageByApp ?? {},
      })
    } else {
      set({
        loaded: true,
        objectives: [],
        freeTime: EMPTY_BANK,
        lastProcessedSessionId: null,
        lastProcessedAppUsageByApp: {},
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
    await persist(get())
    return saved
  },

  async deleteObjective(id) {
    const objectives = get().objectives.filter((o) => o.id !== id)
    set({ objectives })
    await persist(get())
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
    await persist(get())
  },

  async reconcileWithHistory(history, rules) {
    const out = computeCredits({
      history,
      rules,
      objectives: get().objectives,
      lastProcessedSessionId: get().lastProcessedSessionId,
    })

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

    const event: CreditEvent | null =
      out.objectiveDeltas.size > 0 || out.freeTimeDelta > 0
        ? {
            freeTimeDelta: out.freeTimeDelta,
            objectiveDeltas: [...out.objectiveDeltas.entries()].map(
              ([id, m]) => ({ objectiveId: id, minutes: Math.round(m) }),
            ),
            at: new Date().toISOString(),
          }
        : null

    set({
      objectives,
      freeTime: newBank,
      lastProcessedSessionId: out.newCursorSessionId,
      lastCreditEvent: event ?? get().lastCreditEvent,
    })
    await persist(get())
  },

  async reconcileWithAppUsage(apps, usageEntries) {
    if (apps.length === 0) return

    const minutesByDayByApp = buildMinutesByDayMap(usageEntries)
    const cursors = get().lastProcessedAppUsageByApp

    const out = computeCreditsFromAppUsage({
      apps: apps.map((app) => ({
        app,
        minutesByDay: minutesByDayByApp.get(app.id) ?? new Map(),
        lastProcessedDate: cursors[app.id] ?? null,
      })),
    })

    if (
      out.objectiveDeltas.size === 0 &&
      out.freeTimeDelta === 0 &&
      out.newCursorByApp.size === 0
    ) {
      return
    }

    const objectives = get().objectives.map((o) => {
      const delta = out.objectiveDeltas.get(o.id)
      if (!delta) return o
      return { ...o, xpMinutes: o.xpMinutes + delta }
    })

    const bank = get().freeTime
    const newBank: FreeTimeBank = {
      balanceMinutes: bank.balanceMinutes + out.freeTimeDelta,
      entries: [...bank.entries, ...out.freeTimeEntries].slice(-500),
    }

    const newCursors = { ...cursors }
    for (const [appId, date] of out.newCursorByApp.entries()) {
      newCursors[appId] = date
    }

    const event: CreditEvent | null =
      out.objectiveDeltas.size > 0 || out.freeTimeDelta > 0
        ? {
            freeTimeDelta: out.freeTimeDelta,
            objectiveDeltas: [...out.objectiveDeltas.entries()].map(
              ([id, m]) => ({ objectiveId: id, minutes: m }),
            ),
            at: new Date().toISOString(),
          }
        : null

    set({
      objectives,
      freeTime: newBank,
      lastProcessedAppUsageByApp: newCursors,
      lastCreditEvent: event ?? get().lastCreditEvent,
    })
    await persist(get())
  },

  async reconcileFully({ history, rules, apps, usageEntries }) {
    await get().reconcileWithHistory(history, rules)
    await get().reconcileWithAppUsage(apps, usageEntries)
  },

  consumeCreditEvent() {
    set({ lastCreditEvent: null })
  },
}))
