import type { ProposedPlacementBlock } from '@shared/placement-model'
import type { SessionPlanV2 } from '@shared/session-model'
import { AnyDeadlineCrisisContext, AnyObjectiveModel, AnyPriorityScore, AnyTaskModel } from './placement-input-adapter'
import { buildSessionInputFromPlacement } from './session-input-adapter'
import { buildSessionContract } from './session-contract-builder'
import { runSessionPreflight } from './session-preflight-engine'
import { buildSessionTiming } from './session-timing-engine'
import { buildSessionProtectionPlan } from './session-protection-plan-builder'
import { buildSessionLifecycleProjection } from './session-lifecycle-engine'
import { buildSessionClosurePlan } from './session-closure-engine'
import { explainSessionPlan, explainSessionPreflight, explainSessionProtectionPlan } from './session-explanation-engine'
import { runSessionDiagnostics } from './session-diagnostics'

export interface BuildSessionPlanInput {
  userId: string
  placementBlock: ProposedPlacementBlock
  taskModelsV2?: AnyTaskModel[]
  objectiveModelsV2?: AnyObjectiveModel[]
  priorityScoresV2?: AnyPriorityScore[]
  deadlineCrisisContexts?: AnyDeadlineCrisisContext[]
  planningContext?: unknown
  userModel?: unknown
  now?: string
  idFactory?: () => string
}

export function buildSessionPlanV2(input: BuildSessionPlanInput): SessionPlanV2 {
  const { userId, placementBlock, now = new Date().toISOString(), idFactory = () => `sess-${Date.now()}` } = input

  // 1. Adapter input
  const inputData = buildSessionInputFromPlacement(input)

  // 2. Contract
  const contract = buildSessionContract(inputData)

  // 3. Timing
  const timing = buildSessionTiming(inputData)

  // 4. Protection
  const protection = buildSessionProtectionPlan({ contract, inputData })

  // 5. Preflight
  const preflight = runSessionPreflight({ contract, inputData, now })

  // 6. Lifecycle
  const lifecycle = buildSessionLifecycleProjection({ preflight, timing, contract, protection })

  // 7. Closure
  const closure = buildSessionClosurePlan({
    contract,
    sessionPlan: { mode: inputData.placementBlock.placementMode as any }, // Partial mock for closure engine
    deadlineCrisisContext: inputData.deadlineCrisisContext,
    taskModelV2: inputData.linkedTask,
    objectiveModelV2: inputData.linkedObjective,
    userModel: input.userModel
  })

  let confidence = Math.min(
    inputData.confidence,
    contract.confidence,
    preflight.confidence,
    protection.confidence,
    timing.confidence
  )
  
  if (preflight.readiness === 'blocked_by_missing_data') {
    confidence = Math.min(confidence, 10)
  }

  // Initial build of plan without explanation and diagnostics
  const sessionPlan: SessionPlanV2 = {
    id: idFactory(),
    userId,
    sourcePlacementBlockId: placementBlock.id,
    targetType: inputData.targetType,
    targetId: inputData.targetId,
    linkedTaskId: inputData.linkedTask?.id,
    linkedObjectiveId: inputData.linkedObjective?.id,
    title: placementBlock.title,
    mode: placementBlock.placementMode as any,
    date: placementBlock.date,
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
    confidence: Math.max(0, Math.min(100, confidence)),
    metadata: {
      modelVersion: 2,
      createdAt: now,
      updatedAt: now,
      source: 'session_engine'
    }
  }

  // 8. Explanation
  const explanation = explainSessionPlan(sessionPlan)
  sessionPlan.explanation = explanation
  
  // Attach specific engine explanations as reasons for transparency
  const preflightExplanation = explainSessionPreflight(preflight)
  const protectionExplanation = explainSessionProtectionPlan(protection)
  
  sessionPlan.explanation.reasons.push(`Preflight: ${preflightExplanation.summary}`)
  sessionPlan.explanation.reasons.push(`Protection: ${protectionExplanation.summary}`)

  // 9. Diagnostics
  const diagnostics = runSessionDiagnostics(sessionPlan)
  sessionPlan.diagnostics = diagnostics

  if (diagnostics.status === 'critical') {
    sessionPlan.confidence = 0
    // Keep it as a warning so UI can display it as broken.
    sessionPlan.explanation.warnings.push(...diagnostics.issues.map(i => i.message))
  }

  return sessionPlan
}
