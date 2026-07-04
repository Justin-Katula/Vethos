import { create } from 'zustand'
import { sessionFlags } from '@shared/session-flags'
import type { SessionIntegrityResult, SessionOutcomeV2, SessionPlanV2, SessionRuntimeRecord } from '@shared/session-model'
import type { ActiveSession } from '@shared/schemas'
import { vethos } from '@/lib/ipc'
import { assertStorageWrite } from '@/lib/storage-write'
import { normalizeStorageUserId } from './scoped-storage'

type PersistedSessionState = { records: SessionRuntimeRecord[] }

type SessionV2Store = {
  userId: string | null
  loaded: boolean
  records: SessionRuntimeRecord[]
  activePlanId: string | null
  setUserId: (userId?: string | null) => void
  load: (userId: string) => Promise<void>
  upsertPlan: (plan: SessionPlanV2) => Promise<void>
  activate: (plan: SessionPlanV2, runtime: ActiveSession) => Promise<void>
  endRuntime: (planId: string, integrity: SessionIntegrityResult, endedAt: string) => Promise<void>
  recordOutcome: (planId: string, outcome: SessionOutcomeV2) => Promise<void>
}

function isRuntimeRecord(value: unknown): value is SessionRuntimeRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<SessionRuntimeRecord>
  return Boolean(record.plan?.id && record.plan.userId && typeof record.state === 'string')
}

async function persist(userId: string | null, records: SessionRuntimeRecord[]): Promise<void> {
  if (!userId || !sessionFlags.sessionControlsSessionStore) return
  const result = await vethos.storage.write<PersistedSessionState>('sessions_v2', { records: records.slice(-200) }, userId)
  assertStorageWrite(result, 'sessions_v2')
}

export const useSessionV2Store = create<SessionV2Store>((set, get) => ({
  userId: null,
  loaded: false,
  records: [],
  activePlanId: null,

  setUserId(rawUserId) {
    const userId = normalizeStorageUserId(rawUserId) ?? null
    if (get().userId === userId) return
    set({ userId, loaded: false, records: [], activePlanId: null })
  },

  async load(rawUserId) {
    const userId = normalizeStorageUserId(rawUserId)
    if (!userId) return
    const stored = await vethos.storage.read<PersistedSessionState>('sessions_v2', userId)
    const records = Array.isArray(stored?.records) ? stored.records.filter(isRuntimeRecord).slice(-200) : []
    const active = [...records].reverse().find((record) => record.state === 'active')
    set({ userId, loaded: true, records, activePlanId: active?.plan.id ?? null })
  },

  async upsertPlan(plan) {
    if (!sessionFlags.sessionControlsSessionStore) return
    const existing = get().records.find((record) => record.plan.id === plan.id)
    const nextRecord: SessionRuntimeRecord = existing
      ? { ...existing, plan }
      : { plan, state: plan.lifecycle.initialState }
    const records = [...get().records.filter((record) => record.plan.id !== plan.id), nextRecord].slice(-200)
    set({ records })
    await persist(get().userId ?? plan.userId, records)
  },

  async activate(plan, runtime) {
    if (!sessionFlags.sessionControlsSessionStore) return
    const record: SessionRuntimeRecord = {
      plan,
      state: 'active',
      blockingSessionId: runtime.id,
      startedAt: runtime.startedAt,
    }
    const records = [...get().records.filter((candidate) => candidate.plan.id !== plan.id), record].slice(-200)
    set({ records, activePlanId: plan.id })
    await persist(get().userId ?? plan.userId, records)
  },

  async endRuntime(planId, integrity, endedAt) {
    const records = get().records.map((record) => record.plan.id === planId
      ? { ...record, state: integrity.sessionCompleted ? 'completed' as const : 'aborted' as const, endedAt, integrity }
      : record)
    set({ records, activePlanId: get().activePlanId === planId ? null : get().activePlanId })
    await persist(get().userId, records)
  },

  async recordOutcome(planId, outcome) {
    const records = get().records.map((record) => record.plan.id === planId ? { ...record, outcome } : record)
    set({ records })
    await persist(get().userId, records)
  },
}))
