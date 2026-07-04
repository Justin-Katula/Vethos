import type { SessionPlanV2 } from '@shared/session-model'
import type {
  ProtectionRuntimePlanV2,
  RuntimeCoordinatorPlanV2,
} from '@shared/runtime-coordinator-model'
import { buildBlockingProfileDraftFromSessionProtection } from './session-protection-to-blocking-profile-adapter'
import { buildRuntimeSignalBridgePlan } from './runtime-signal-bridge-planner'
import { buildRuntimeClosureBridgePlan } from './runtime-closure-bridge-planner'
import { runRuntimeCoordinatorSafetyCheck } from './runtime-coordinator-safety-engine'
import { buildProtectionRecoveryPlan } from './protection-recovery-plan-engine'
import { buildRuntimeCoordinatorExplanation } from './runtime-coordinator-explanation-engine'
import { runRuntimeCoordinatorDiagnostics } from './runtime-coordinator-diagnostics'

export function buildRuntimeCoordinatorPlanV2(input: {
  userId: string
  sessionPlan: SessionPlanV2
  protectionRuntimePlan?: ProtectionRuntimePlanV2
  now?: string
  idFactory?: () => string
}): RuntimeCoordinatorPlanV2 {
  const { userId, sessionPlan, protectionRuntimePlan } = input
  const now = input.now ?? new Date().toISOString()
  const idFactory = input.idFactory ?? (() => crypto.randomUUID())

  const blockingProfileDraft = buildBlockingProfileDraftFromSessionProtection({
    sessionPlan,
    protectionRuntimePlan,
    now,
  })

  const signalBridgePlan = buildRuntimeSignalBridgePlan({
    sessionPlan,
    blockingProfileDraft,
  })

  const closureBridgePlan = buildRuntimeClosureBridgePlan({
    sessionPlan,
    signalBridgePlan,
  })

  const safety = runRuntimeCoordinatorSafetyCheck({
    sessionPlan,
    protectionRuntimePlan,
    blockingProfileDraft,
  })

  // Point 9.10 — Plan de récupération système (consultatif).
  const recovery = buildProtectionRecoveryPlan({
    blockingProfileDraft,
    safety,
    now,
  })

  const explanation = buildRuntimeCoordinatorExplanation({
    blockingProfileDraft,
    signalBridgePlan,
    closureBridgePlan,
  })

  let mode: RuntimeCoordinatorPlanV2['mode'] = 'inactive'
  
  if (safety.status === 'critical') {
    mode = 'unsafe'
  } else if (blockingProfileDraft.mode === 'manual_review') {
    mode = 'manual_review_required'
  } else if (safety.status === 'warning') {
    mode = 'ready_for_preview'
  } else {
    mode = 'ready_for_preview'
  }

  const confidence = Math.min(
    1.0,
    blockingProfileDraft.confidence,
    signalBridgePlan.confidence,
    closureBridgePlan.confidence,
    safety.confidence
  )

  const partialPlan: Omit<RuntimeCoordinatorPlanV2, 'diagnostics'> = {
    id: idFactory(),
    userId,
    sessionPlanId: sessionPlan.id,
    mode,
    protectionRuntimePlan,
    blockingProfileDraft,
    signalBridgePlan,
    closureBridgePlan,
    safety,
    recovery,
    explanation,
    confidence,
    metadata: {
      modelVersion: 1,
      createdAt: now,
      updatedAt: now,
      source: 'runtime_coordinator',
    },
  }

  const diagnostics = runRuntimeCoordinatorDiagnostics(partialPlan)

  return {
    ...partialPlan,
    diagnostics,
  }
}
