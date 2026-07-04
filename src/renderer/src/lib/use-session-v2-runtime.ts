import { useEffect, useRef } from 'react'
import type { ActiveSession } from '@shared/schemas'
import { sessionFlags } from '@shared/session-flags'
import { useBlockingStore } from '@/store/blocking.store'
import { useSessionV2Store } from '@/store/session-v2.store'
import { useTasksStore } from '@/store/tasks.store'
import { useUserModelStore } from '@/store/user-model.store'
import { calculateSessionIntegrity } from './session-integrity-engine'
import { buildSessionOutcomeV2 } from './session-outcome-engine'

export function useSessionV2Runtime(): void {
  const active = useBlockingStore((state) => state.active)
  const records = useSessionV2Store((state) => state.records)
  const userModel = useUserModelStore((state) => state.model)
  const previousRef = useRef<ActiveSession | null>(null)

  useEffect(() => {
    const previous = previousRef.current
    previousRef.current = active
    if (active || !previous || !sessionFlags.sessionControlsSessionStore) return

    const record = [...records].reverse().find((candidate) => candidate.blockingSessionId === previous.id)
    if (!record || record.integrity) return
    const endedAt = new Date().toISOString()
    const endedTime = Date.parse(endedAt)
    const plannedEnd = Date.parse(previous.endsAt)
    const activeDurationMinutes = Math.max(0, Math.round((endedTime - Date.parse(previous.startedAt)) / 60_000))
    const unlockRequestCount = userModel?.behaviorEvents.filter((event) =>
      event.type === 'unlock_requested' && event.context?.sessionId === previous.id,
    ).length ?? 0
    const distractionAttemptCount = userModel?.behaviorEvents.filter((event) =>
      (event.type === 'app_opened_during_session' || event.type === 'site_opened_during_session') &&
      event.context?.sessionId === previous.id,
    ).length ?? 0
    const completedNormally = Number.isFinite(plannedEnd) && endedTime >= plannedEnd - 2_000
    const integrity = calculateSessionIntegrity({
      sessionPlan: record.plan,
      runtimeSignals: {
        activeDurationMinutes,
        unlockRequestCount,
        distractionAttemptCount,
        earlyStopped: !completedNormally,
        completedNormally,
      },
      now: endedAt,
    })

    void useSessionV2Store.getState().endRuntime(record.plan.id, integrity, endedAt).then(async () => {
      if (record.plan.closure.required) return
      const outcome = buildSessionOutcomeV2({ sessionPlan: record.plan, integrityResult: integrity })
      await useSessionV2Store.getState().recordOutcome(record.plan.id, outcome)
      if (sessionFlags.sessionControlsCompletion && record.plan.linkedTaskId) {
        await useTasksStore.getState().applyVerifiedSessionOutcome(record.plan.linkedTaskId, outcome)
      }
    })
  }, [active, records, userModel])
}
