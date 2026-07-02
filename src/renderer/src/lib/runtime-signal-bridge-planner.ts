import type { SessionPlanV2 } from '@shared/session-model'
import type {
  BlockingProfileDraft,
  RuntimeSignalBridgePlan,
} from '@shared/runtime-coordinator-model'

export function buildRuntimeSignalBridgePlan(input: {
  sessionPlan: SessionPlanV2
  blockingProfileDraft: BlockingProfileDraft
}): RuntimeSignalBridgePlan {
  const { sessionPlan } = input

  let shouldListenToBlockedAttemptLater = false
  let shouldListenToSessionEndedLater = true
  let shouldListenToUnlockRequestsLater = false

  if (sessionPlan.protection.mode !== 'none') {
    shouldListenToBlockedAttemptLater = true
  }

  if (sessionPlan.protection.unlockPolicy) {
    shouldListenToUnlockRequestsLater = true
  }

  const warnings: string[] = []
  
  return {
    shouldListenToBlockedAttemptLater,
    shouldListenToSessionEndedLater,
    shouldListenToUnlockRequestsLater,

    blockedAttemptSignalMapping: {
      outputSignal: 'distractionAttemptCount',
      sourceEvent: 'blockedAttempt',
    },
    sessionEndedSignalMapping: {
      outputSignal: 'completedNormally', // The actual output signal will be based on the payload (e.g. endedEarly or missed)
      sourceEvent: 'sessionEnded',
    },
    unlockSignalMapping: {
      outputSignal: 'unlockRequestCount',
      sourceEvent: 'unlockRequested',
    },

    warnings,
    confidence: 1.0,
  }
}
