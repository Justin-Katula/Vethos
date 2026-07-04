import type { PriorityEngineContext } from './priority-engine'
import { buildTaskPriorityResult } from './priority-engine'
import { buildTaskUnderstandingResult, type CoachUnderstandingHint } from './understanding-engine'
import { buildCompletionGateResult } from './completion-gate-engine'
import type { CompletionClaim, CompletionContract, CompletionSessionEvidence } from '@shared/completion-gate'
import type { Objective, RegistryItem, Task } from '@shared/schemas'
import type { TaskModelV2 } from '@shared/task-model'
import { DEFAULT_TASK_MODEL_V2_FLAGS, TASK_MODEL_V2_VERSION } from '@shared/task-model'
import type { ObjectiveModelV2 } from '@shared/objective-model'
import type { UserModel } from '@shared/user-model'

import { buildTaskPurpose } from './task-purpose-builder'
import { buildTaskWorkload } from './task-workload-builder'
import { buildTaskUrgency } from './task-urgency-builder'
import { buildTaskProgress, type TaskModelSessionLike } from './task-progress-builder'
import { buildTaskRisk } from './task-risk-builder'
import { buildTaskAppSiteContext } from './task-app-site-context'
import { buildTaskSessionProfile } from './task-session-profile'
import { buildTaskProtectionProfile } from './task-protection-profile'
import { buildTaskNextStep } from './task-next-step-engine'
import { buildTaskLifecycleStatus } from './task-lifecycle-engine'
import { isWithinDays, unique } from './task-model-utils'

export type BuildTaskModelV2Input = {
  task: Task
  objective?: Objective | null
  objectiveModel?: ObjectiveModelV2 | null
  sessions?: TaskModelSessionLike[]
  userModel?: UserModel | null
  registry?: RegistryItem[]
  now?: Date
  usableFreeMinutesBeforeDeadline?: number | null
  priorityContext?: PriorityEngineContext
  coachUnderstanding?: CoachUnderstandingHint
  completionContract?: CompletionContract | null
  completionClaim?: CompletionClaim | null
  completionSessionEvidence?: CompletionSessionEvidence | null
}

export function buildTaskModelV2(input: BuildTaskModelV2Input): TaskModelV2 {
  const now = input.now ?? new Date()
  const sessions = input.sessions ?? []
  
  const priorityContext: PriorityEngineContext = {
    ...input.priorityContext,
    now,
    usableFreeMinutesBeforeDeadline: input.usableFreeMinutesBeforeDeadline ?? input.priorityContext?.usableFreeMinutesBeforeDeadline,
    recentlyWorkedTargetIds: sessions
      .filter((session) => isWithinDays(session.endedAt ?? session.startedAt, now, 7))
      .flatMap((session) => [session.targetId, session.taskId, session.objectiveId].filter(Boolean) as string[]),
    recentlyCompletedTaskIds: input.task.completedAt && isWithinDays(input.task.completedAt, now, 7) ? [input.task.id] : [],
  }
  
  const priority = buildTaskPriorityResult(input.task, input.objective, priorityContext)
  const understanding = buildTaskUnderstandingResult(input.task, input.registry, input.coachUnderstanding)
  
  const workload = buildTaskWorkload({ task: input.task, priority })
  const urgency = buildTaskUrgency({ task: input.task, priority, now, usableFreeMinutesBeforeDeadline: input.usableFreeMinutesBeforeDeadline })
  const progress = buildTaskProgress({ task: input.task, sessions, priority, now })
  
  const purpose = buildTaskPurpose({
    task: input.task,
    objective: input.objective,
    objectiveModel: input.objectiveModel,
    priority,
    domain: understanding.category,
    understandingReasons: understanding.reasons,
  })
  
  const risk = buildTaskRisk({
    task: input.task,
    workload,
    urgency,
    progress,
    priority,
    userModel: input.userModel,
    now,
  })
  
  const appSiteContext = buildTaskAppSiteContext({
    task: input.task,
    objective: input.objective,
    domain: purpose.domain,
    understandingUsefulApps: understanding.usefulAppsGuess,
    understandingUsefulSites: understanding.usefulSitesGuess,
    preferences: input.userModel?.appSitePreferences,
    registry: input.registry,
  })
  
  const session = buildTaskSessionProfile({ workload, urgency, risk })
  
  const protection = buildTaskProtectionProfile({
    task: input.task,
    objective: input.objective,
    purpose,
    workload,
    urgency,
    risk,
    appSiteContext,
    userModel: input.userModel,
  })
  
  const nextStep = buildTaskNextStep({ task: input.task, workload, risk, session })
  
  const lifecycle = buildTaskLifecycleStatus({
    task: input.task,
    progress,
    urgency,
    risk,
    workload,
  })
  
  const completionVerification = buildCompletionGateResult({
    task: input.task,
    objective: input.objective,
    objectiveImportanceScore: purpose.importanceScore,
    contract: input.completionContract,
    claim: input.completionClaim,
    session: input.completionSessionEvidence,
    userModel: input.userModel,
    now,
  })
  
  const reasons = unique([
    ...priority.humanReasons,
    ...purpose.reasons,
    ...workload.reasons,
    ...urgency.reasons,
    ...progress.reasons,
    ...risk.reasons,
    ...session.reasons,
    ...protection.reasons,
    ...nextStep.reasons,
    ...completionVerification.reasons,
  ])
  const warnings = unique([...risk.warnings, ...completionVerification.warnings])

  return {
    identity: {
      id: input.task.id,
      title: input.task.title,
      status: input.task.status,
      linkedObjectiveId: input.task.linkedObjectiveId,
      createdAt: input.task.createdAt,
    },
    purpose,
    workload,
    urgency,
    progress,
    risk,
    session,
    protection,
    appSiteContext,
    nextStep,
    lifecycle,
    completionVerification,
    explanation: {
      title: `${input.task.title} — Modèle Intelligent`,
      summary: `Vethos évalue cette tâche comme ${purpose.strength} avec une urgence ${urgency.urgencyLevel}.`,
      reasons,
      warnings,
    },
    metadata: {
      version: TASK_MODEL_V2_VERSION,
      generatedAt: now.toISOString(),
      source: 'task_model_builder',
      flags: DEFAULT_TASK_MODEL_V2_FLAGS,
      debug: {
        priorityScore: priority.priorityScore,
        understandingConfidence: understanding.confidence,
        linkedObjectiveProvided: Boolean(input.objective),
        objectiveModelProvided: Boolean(input.objectiveModel),
      },
    },
  }
}
