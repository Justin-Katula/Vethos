import type { SessionMode, SessionPlanV2 } from '@shared/session-model'
import { buildSessionClosurePlan } from './session-closure-engine'
import { buildSessionContract } from './session-contract-builder'
import { runSessionDiagnostics } from './session-diagnostics'
import { explainSessionPlan, explainSessionPreflight, explainSessionProtectionPlan } from './session-explanation-engine'
import {
  buildSessionInputFromPlacement,
  type BuildSessionInputParams,
  sessionObjectiveId,
  sessionTaskId,
} from './session-input-adapter'
import { buildSessionLifecycleProjection } from './session-lifecycle-engine'
import { runSessionPreflight } from './session-preflight-engine'
import { buildSessionProtectionPlan } from './session-protection-plan-builder'
import { buildSessionTiming } from './session-timing-engine'

export interface BuildSessionPlanInput extends BuildSessionInputParams {
  userId: string
  idFactory?: () => string
}

function sessionMode(input: ReturnType<typeof buildSessionInputFromPlacement>): SessionMode {
  if (input.placementBlock.kind === 'recovery') return 'recovery'
  if (input.placementBlock.kind === 'review' || input.placementBlock.kind === 'diagnostic') return 'review'
  return input.placementBlock.placementMode
}

export function buildSessionPlanV2(input: BuildSessionPlanInput): SessionPlanV2 {
  const now = input.now ?? new Date().toISOString()
  const idFactory = input.idFactory ?? (() => crypto.randomUUID())
  const inputData = buildSessionInputFromPlacement({ ...input, now })
  const contract = buildSessionContract(inputData)
  const timing = buildSessionTiming(inputData)
  const protection = buildSessionProtectionPlan({ contract, inputData })
  const preflight = runSessionPreflight({ contract, inputData, protection, now })
  const lifecycle = buildSessionLifecycleProjection({ preflight, timing, contract, protection })
  const mode = sessionMode(inputData)
  const closure = buildSessionClosurePlan({
    contract,
    sessionPlan: { mode },
    deadlineCrisisContext: inputData.deadlineCrisisContext,
    userModel: inputData.userModel,
  })
  let confidence = Math.min(
    inputData.confidence,
    contract.confidence,
    preflight.confidence,
    protection.confidence,
    timing.confidence,
  )
  if (inputData.requiresManualReview) confidence = Math.min(confidence, 40)

  const plan: SessionPlanV2 = {
    id: idFactory(),
    userId: input.userId,
    sourcePlacementBlockId: input.placementBlock.id,
    targetType: inputData.targetType,
    targetId: inputData.targetId,
    ...(inputData.linkedTask ? { linkedTaskId: sessionTaskId(inputData.linkedTask) } : {}),
    ...(inputData.linkedObjective ? { linkedObjectiveId: sessionObjectiveId(inputData.linkedObjective) } : {}),
    title: input.placementBlock.title,
    mode,
    date: input.placementBlock.date,
    plannedStart: timing.plannedStart,
    plannedEnd: timing.plannedEnd,
    plannedDurationMinutes: timing.plannedDurationMinutes,
    minimumUsefulMinutes: timing.minimumUsefulMinutes,
    maximumSafeMinutes: timing.maximumSafeMinutes,
    contract,
    preflight,
    protection,
    lifecycle,
    closure,
    explanation: { title: '', summary: '', reasons: [], warnings: [] },
    confidence: Math.max(0, Math.min(100, Number.isFinite(confidence) ? confidence : 0)),
    metadata: {
      modelVersion: 2,
      createdAt: now,
      updatedAt: now,
      source: 'session_engine',
    },
  }

  plan.explanation = explainSessionPlan(plan)
  const preflightExplanation = explainSessionPreflight(preflight)
  const protectionExplanation = explainSessionProtectionPlan(protection)
  plan.explanation.reasons = Array.from(new Set([
    ...plan.explanation.reasons,
    preflightExplanation.summary,
    protectionExplanation.summary,
  ]))
  plan.diagnostics = runSessionDiagnostics(plan)
  if (plan.diagnostics.status === 'critical') {
    plan.confidence = 0
    plan.lifecycle.initialState = 'invalid'
    plan.explanation.warnings.push(...plan.diagnostics.issues.map((issue) => issue.message))
  }
  return plan
}
