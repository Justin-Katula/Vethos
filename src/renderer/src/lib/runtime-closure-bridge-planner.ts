import type { SessionPlanV2 } from '@shared/session-model'
import type {
  RuntimeSignalBridgePlan,
  RuntimeClosureBridgePlan,
} from '@shared/runtime-coordinator-model'

export function buildRuntimeClosureBridgePlan(input: {
  sessionPlan: SessionPlanV2
  signalBridgePlan: RuntimeSignalBridgePlan
}): RuntimeClosureBridgePlan {
  const { sessionPlan } = input

  let shouldTriggerClosureLater = false
  let closureEngineToUse: RuntimeClosureBridgePlan['closureEngineToUse'] = 'none'

  if (sessionPlan.closure.required) {
    shouldTriggerClosureLater = true
  }

  if (sessionPlan.closure.closurePromptType === 'manual_review') {
    closureEngineToUse = 'manual_review'
  } else if (sessionPlan.contract.completionPolicy === 'completion_gate') {
    closureEngineToUse = 'session-outcome-engine'
  } else if (sessionPlan.closure.required) {
    closureEngineToUse = 'session-closure-engine'
  }

  let when: RuntimeClosureBridgePlan['when'] = 'after_sessionEnded'
  if (closureEngineToUse === 'manual_review') {
    when = 'manual_only'
  }

  return {
    shouldTriggerClosureLater,
    closureEngineToUse,
    when,
    shouldApplyOutcomeToTaskStoreNow: false,
    reasons: [],
    warnings: [],
    confidence: 1.0,
  }
}
