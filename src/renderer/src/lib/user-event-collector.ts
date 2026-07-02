import type { ActiveSession, Objective, Task } from '@shared/schemas'
import {
  normalizeUserModelDomain,
  type UserBehaviorEvent,
  type UserBehaviorEventType,
} from '@shared/user-model'

type EventTargetType = UserBehaviorEvent['targetType']
type EventContext = NonNullable<UserBehaviorEvent['context']>

export type CreateUserBehaviorEventInput = {
  id?: string
  type: UserBehaviorEventType
  targetType?: EventTargetType
  targetId?: string
  context?: EventContext
  metadata?: Record<string, unknown>
  createdAt?: string
}

export type SessionEventLike = Partial<ActiveSession> & {
  id?: string
  sessionId?: string
  taskId?: string
  objectiveId?: string
  blockId?: string
  endedAt?: string
  plannedMinutes?: number
  actualMinutes?: number
  elapsedMinutes?: number
  protectionLevel?: number
  reason?: string
}

export type RecommendationLike = {
  id?: string
  targetType?: EventTargetType
  targetId?: string
  reason?: string
}

export type AppLike =
  | string
  | {
      identifier?: string
      executableName?: string
      exeName?: string
      displayName?: string
      name?: string
      classificationAtTime?: string
    }

export type SiteLike =
  | string
  | {
      domain?: string
      url?: string
      identifier?: string
      displayName?: string
      classificationAtTime?: string
    }

export type UnlockRequestLike = {
  id?: string
  targetType?: 'app' | 'site'
  targetId?: string
  app?: AppLike
  site?: SiteLike
  sessionId?: string
  taskId?: string
  objectiveId?: string
  explanation?: string
  necessityScore?: number
  credibilityScore?: number
  urgencyScore?: number
}

export type UnlockDecisionLike = {
  decision?: 'allowed' | 'denied' | 'coach_error'
  allowMinutes?: number
  reason?: string
}

function nowIso(): string {
  return new Date().toISOString()
}

function randomId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

function cleanText(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : undefined
}

function sanitizeString(value: string): string {
  return value
    .replace(/https?:\/\/([^/\s?#]+)[^\s]*/giu, (_match, host: string) => normalizeUserModelDomain(host))
    .replace(/\bwww\.([a-z0-9.-]+\.[a-z]{2,})(?:[/?#][^\s]*)?/giu, (_match, host: string) =>
      normalizeUserModelDomain(host),
    )
    .replace(
      /\b((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,})(?:\/[^\s]*)/giu,
      (_match, host: string) => normalizeUserModelDomain(host),
    )
}

function sanitizeMetadata(value: unknown): unknown {
  if (typeof value === 'string') return sanitizeString(value)
  if (Array.isArray(value)) return value.map(sanitizeMetadata)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, sanitizeMetadata(nested)]))
  }
  return value
}

function eventContext(context?: EventContext): EventContext | undefined {
  if (!context) return undefined
  const next = {
    taskId: cleanText(context.taskId),
    objectiveId: cleanText(context.objectiveId),
    sessionId: cleanText(context.sessionId),
    blockId: cleanText(context.blockId),
  }
  return Object.values(next).some(Boolean) ? next : undefined
}

function taskContext(task: Pick<Task, 'id' | 'linkedObjectiveId'>, context?: EventContext): EventContext {
  return {
    ...context,
    taskId: context?.taskId ?? task.id,
    objectiveId: context?.objectiveId ?? task.linkedObjectiveId ?? undefined,
  }
}

function sessionId(session: SessionEventLike): string | undefined {
  return session.id ?? session.sessionId
}

function sessionContext(session: SessionEventLike, context?: EventContext): EventContext {
  return {
    ...context,
    sessionId: context?.sessionId ?? sessionId(session),
    taskId: context?.taskId ?? session.taskId,
    objectiveId: context?.objectiveId ?? session.objectiveId,
    blockId: context?.blockId ?? session.blockId,
  }
}

function appIdentifier(app: AppLike): string {
  if (typeof app === 'string') return app
  return app.executableName ?? app.exeName ?? app.identifier ?? app.name ?? app.displayName ?? 'unknown-app'
}

function appDisplayName(app: AppLike): string | undefined {
  if (typeof app === 'string') return undefined
  return app.displayName ?? app.name
}

function siteDomain(site: SiteLike): string {
  if (typeof site === 'string') return normalizeUserModelDomain(site)
  return normalizeUserModelDomain(site.domain ?? site.url ?? site.identifier ?? site.displayName ?? 'unknown.site')
}

function unlockTarget(request: UnlockRequestLike): { targetType?: 'app' | 'site'; targetId?: string } {
  if (request.targetType === 'site' || request.site) {
    return {
      targetType: 'site',
      targetId: request.targetId ? normalizeUserModelDomain(request.targetId) : request.site ? siteDomain(request.site) : undefined,
    }
  }
  if (request.targetType === 'app' || request.app) {
    return {
      targetType: 'app',
      targetId: request.targetId ?? (request.app ? appIdentifier(request.app) : undefined),
    }
  }
  return { targetType: request.targetType, targetId: request.targetId }
}

export function createUserBehaviorEvent(input: CreateUserBehaviorEventInput): UserBehaviorEvent {
  const targetId =
    input.targetType === 'site' && input.targetId ? normalizeUserModelDomain(input.targetId) : cleanText(input.targetId)
  return {
    id: input.id ?? randomId('event'),
    type: input.type,
    targetType: input.targetType,
    targetId,
    context: eventContext(input.context),
    metadata: input.metadata ? (sanitizeMetadata(input.metadata) as Record<string, unknown>) : undefined,
    createdAt: input.createdAt ?? nowIso(),
  }
}

export function createTaskCreatedEvent(task: Task, context?: EventContext): UserBehaviorEvent {
  return createUserBehaviorEvent({
    type: 'task_created',
    targetType: 'task',
    targetId: task.id,
    context: taskContext(task, context),
    metadata: {
      complexity: task.difficulty ?? task.complexity,
      estimatedMinutes: task.estimatedMinutes,
      remainingMinutes: task.remainingMinutes,
      deadline: task.deadline,
      deadlineImpact: task.deadlineImpact,
    },
  })
}

export function createTaskStartedEvent(task: Task, context?: EventContext): UserBehaviorEvent {
  return createUserBehaviorEvent({
    type: 'task_started',
    targetType: 'task',
    targetId: task.id,
    context: taskContext(task, context),
  })
}

export function createTaskCompletedEvent(task: Task, context?: EventContext): UserBehaviorEvent {
  return createUserBehaviorEvent({
    type: 'task_completed',
    targetType: 'task',
    targetId: task.id,
    context: taskContext(task, context),
    metadata: {
      completedAt: task.completedAt,
      estimatedMinutes: task.estimatedMinutes,
      remainingMinutes: task.remainingMinutes,
    },
    createdAt: task.completedAt,
  })
}

export function createTaskSkippedEvent(task: Task, context?: EventContext): UserBehaviorEvent {
  return createUserBehaviorEvent({
    type: 'task_skipped',
    targetType: 'task',
    targetId: task.id,
    context: taskContext(task, context),
  })
}

export function createTaskExpiredEvent(task: Task, context?: EventContext): UserBehaviorEvent {
  return createUserBehaviorEvent({
    type: 'task_expired',
    targetType: 'task',
    targetId: task.id,
    context: taskContext(task, context),
    metadata: {
      deadline: task.deadline,
      deadlineTime: task.deadlineTime,
    },
  })
}

export function createObjectiveSelectedEvent(objective: Objective | { id: string }, context?: EventContext): UserBehaviorEvent {
  return createUserBehaviorEvent({
    type: 'objective_selected',
    targetType: 'objective',
    targetId: objective.id,
    context,
  })
}

export function createSessionStartedEvent(session: SessionEventLike, context?: EventContext): UserBehaviorEvent {
  return createUserBehaviorEvent({
    type: 'session_started',
    targetType: 'session',
    targetId: sessionId(session),
    context: sessionContext(session, context),
    metadata: {
      plannedMinutes: session.plannedMinutes ?? session.durationMinutes,
      protectionLevel: session.protectionLevel,
    },
    createdAt: session.startedAt,
  })
}

export function createSessionCompletedEvent(session: SessionEventLike, context?: EventContext): UserBehaviorEvent {
  return createUserBehaviorEvent({
    type: 'session_completed',
    targetType: 'session',
    targetId: sessionId(session),
    context: sessionContext(session, context),
    metadata: {
      plannedMinutes: session.plannedMinutes ?? session.durationMinutes,
      actualMinutes: session.actualMinutes ?? session.durationMinutes,
      protectionLevel: session.protectionLevel,
    },
    createdAt: session.endedAt,
  })
}

export function createSessionAbortedEvent(session: SessionEventLike, context?: EventContext): UserBehaviorEvent {
  return createUserBehaviorEvent({
    type: 'session_aborted',
    targetType: 'session',
    targetId: sessionId(session),
    context: sessionContext(session, context),
    metadata: {
      elapsedMinutes: session.elapsedMinutes,
      plannedMinutes: session.plannedMinutes ?? session.durationMinutes,
      reason: session.reason,
    },
    createdAt: session.endedAt,
  })
}

export function createRecommendationAcceptedEvent(
  recommendation: RecommendationLike,
  context?: EventContext,
): UserBehaviorEvent {
  return createUserBehaviorEvent({
    type: 'recommendation_accepted',
    targetType: recommendation.targetType,
    targetId: recommendation.targetId ?? recommendation.id,
    context,
    metadata: { reason: recommendation.reason },
  })
}

export function createRecommendationRejectedEvent(
  recommendation: RecommendationLike,
  context?: EventContext,
): UserBehaviorEvent {
  return createUserBehaviorEvent({
    type: 'recommendation_rejected',
    targetType: recommendation.targetType,
    targetId: recommendation.targetId ?? recommendation.id,
    context,
    metadata: { reason: recommendation.reason },
  })
}

export function createAppOpenedDuringSessionEvent(
  app: AppLike,
  session: SessionEventLike,
  context?: EventContext & { classificationAtTime?: string; protectionMode?: string },
): UserBehaviorEvent {
  return createUserBehaviorEvent({
    type: 'app_opened_during_session',
    targetType: 'app',
    targetId: appIdentifier(app),
    context: sessionContext(session, context),
    metadata: {
      appName: appDisplayName(app),
      classificationAtTime: context?.classificationAtTime ?? (typeof app === 'string' ? undefined : app.classificationAtTime),
      protectionMode: context?.protectionMode,
    },
  })
}

export function createSiteOpenedDuringSessionEvent(
  site: SiteLike,
  session: SessionEventLike,
  context?: EventContext & { classificationAtTime?: string; protectionMode?: string },
): UserBehaviorEvent {
  const domain = siteDomain(site)
  return createUserBehaviorEvent({
    type: 'site_opened_during_session',
    targetType: 'site',
    targetId: domain,
    context: sessionContext(session, context),
    metadata: {
      domain,
      siteName: typeof site === 'string' ? undefined : site.displayName,
      classificationAtTime: context?.classificationAtTime ?? (typeof site === 'string' ? undefined : site.classificationAtTime),
      protectionMode: context?.protectionMode,
    },
  })
}

export function createUnlockRequestedEvent(request: UnlockRequestLike, context?: EventContext): UserBehaviorEvent {
  const target = unlockTarget(request)
  return createUserBehaviorEvent({
    type: 'unlock_requested',
    targetType: target.targetType,
    targetId: target.targetId,
    context: {
      ...context,
      sessionId: context?.sessionId ?? request.sessionId,
      taskId: context?.taskId ?? request.taskId,
      objectiveId: context?.objectiveId ?? request.objectiveId,
    },
    metadata: {
      requestId: request.id,
      explanationLength: request.explanation?.trim().length ?? 0,
      necessityScore: request.necessityScore,
      credibilityScore: request.credibilityScore,
      urgencyScore: request.urgencyScore,
    },
  })
}

export function createUnlockAcceptedEvent(
  request: UnlockRequestLike,
  decision: UnlockDecisionLike,
  context?: EventContext,
): UserBehaviorEvent {
  const target = unlockTarget(request)
  return createUserBehaviorEvent({
    type: 'unlock_accepted',
    targetType: target.targetType,
    targetId: target.targetId,
    context: {
      ...context,
      sessionId: context?.sessionId ?? request.sessionId,
      taskId: context?.taskId ?? request.taskId,
      objectiveId: context?.objectiveId ?? request.objectiveId,
    },
    metadata: {
      requestId: request.id,
      allowMinutes: decision.allowMinutes,
      decision: decision.decision ?? 'allowed',
    },
  })
}

export function createUnlockRefusedEvent(
  request: UnlockRequestLike,
  decision: UnlockDecisionLike,
  context?: EventContext,
): UserBehaviorEvent {
  const target = unlockTarget(request)
  return createUserBehaviorEvent({
    type: 'unlock_refused',
    targetType: target.targetType,
    targetId: target.targetId,
    context: {
      ...context,
      sessionId: context?.sessionId ?? request.sessionId,
      taskId: context?.taskId ?? request.taskId,
      objectiveId: context?.objectiveId ?? request.objectiveId,
    },
    metadata: {
      requestId: request.id,
      decision: decision.decision ?? 'denied',
      reason: decision.reason,
    },
  })
}

export function createAppManuallyAllowedEvent(app: AppLike, context?: EventContext): UserBehaviorEvent {
  return createUserBehaviorEvent({
    type: 'app_manually_allowed',
    targetType: 'app',
    targetId: appIdentifier(app),
    context,
    metadata: {
      appName: appDisplayName(app),
      source: 'user_correction',
      newClassification: 'useful',
    },
  })
}

export function createAppManuallyBlockedEvent(app: AppLike, context?: EventContext): UserBehaviorEvent {
  return createUserBehaviorEvent({
    type: 'app_manually_blocked',
    targetType: 'app',
    targetId: appIdentifier(app),
    context,
    metadata: {
      appName: appDisplayName(app),
      source: 'user_correction',
      newClassification: 'distraction',
    },
  })
}

export function createSiteManuallyAllowedEvent(site: SiteLike, context?: EventContext): UserBehaviorEvent {
  return createUserBehaviorEvent({
    type: 'site_manually_allowed',
    targetType: 'site',
    targetId: siteDomain(site),
    context,
    metadata: {
      domain: siteDomain(site),
      source: 'user_correction',
      newClassification: 'useful',
    },
  })
}

export function createSiteManuallyBlockedEvent(site: SiteLike, context?: EventContext): UserBehaviorEvent {
  return createUserBehaviorEvent({
    type: 'site_manually_blocked',
    targetType: 'site',
    targetId: siteDomain(site),
    context,
    metadata: {
      domain: siteDomain(site),
      source: 'user_correction',
      newClassification: 'distraction',
    },
  })
}
