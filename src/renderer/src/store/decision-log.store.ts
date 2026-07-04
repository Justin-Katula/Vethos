import { create } from 'zustand'
import { appendDecisionLogEntry, DEFAULT_DECISION_LOG_LIMIT, sanitizeDecisionLogEntry } from '@shared/decision-log'
import type { DecisionLogEntry } from '@shared/engine-results'
import { vethos } from '@/lib/ipc'
import { DEFAULT_ENGINE_FLAGS } from '@shared/engine-results'

type DecisionLogState = {
  entries: DecisionLogEntry[]
  loaded: boolean
  userId: string | null
  setUserId: (userId?: string | null) => void
  reset: () => void
  load: (userId?: string) => Promise<void>
  record: (entry: Omit<DecisionLogEntry, 'id' | 'createdAt'> & Partial<Pick<DecisionLogEntry, 'id' | 'createdAt'>>) => Promise<DecisionLogEntry | null>
}

const EMPTY = { entries: [] as DecisionLogEntry[], loaded: false, userId: null as string | null }
let writeQueue: Promise<void> = Promise.resolve()

function fingerprint(entry: Omit<DecisionLogEntry, 'id' | 'createdAt'>): string {
  const { debug: _debug, ...meaningful } = entry
  return JSON.stringify(meaningful)
}

async function persist(entries: DecisionLogEntry[], userId: string): Promise<void> {
  writeQueue = writeQueue.catch(() => undefined).then(async () => {
    const result = await vethos.storage.write('decision_log', { entries }, userId)
    if (!result.ok) throw new Error(result.error)
  })
  await writeQueue
}

export const useDecisionLogStore = create<DecisionLogState>((set, get) => ({
  ...EMPTY,
  setUserId(raw) {
    const userId = raw?.trim() || null
    if (get().userId !== userId) set({ ...EMPTY, userId })
  },
  reset() { set({ ...EMPTY }) },
  async load(raw) {
    const userId = raw?.trim() || get().userId
    if (!userId) { get().reset(); return }
    const stored = await vethos.storage.read<{ entries?: DecisionLogEntry[] }>('decision_log', userId).catch(() => null)
    const entries = Array.isArray(stored?.entries)
      ? stored.entries.slice(-DEFAULT_DECISION_LOG_LIMIT)
      : []
    set({ userId, entries, loaded: true })
  },
  async record(input) {
    const userId = get().userId
    if (!userId || !DEFAULT_ENGINE_FLAGS.decisionLogEnabled) return null
    if (!get().loaded) await get().load(userId)
    if (get().userId !== userId) return null
    const createdAt = input.createdAt ?? new Date().toISOString()
    const { id: suppliedId, createdAt: _createdAt, ...payload } = input
    const sanitizedCandidate = sanitizeDecisionLogEntry({ ...payload, id: suppliedId ?? '', createdAt })
    const { id: _candidateId, createdAt: _candidateAt, ...candidatePayload } = sanitizedCandidate
    const previous = [...get().entries].reverse().find((entry) => entry.type === payload.type && entry.targetType === payload.targetType && entry.targetId === payload.targetId)
    if (previous) {
      const { id: _id, createdAt: _at, ...previousPayload } = previous
      if (fingerprint(previousPayload) === fingerprint(candidatePayload)) return previous
    }
    const entry: DecisionLogEntry = {
      ...candidatePayload,
      id: suppliedId ?? `decision_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`,
      createdAt,
    }
    const entries = appendDecisionLogEntry(get().entries, entry)
    set({ entries })
    await persist(entries, userId)
    return entry
  },
}))
