import type { LearningUpdate } from '@shared/engine-results'
import type { Objective, Task } from '@shared/schemas'

export const LEARNING_REPEAT_THRESHOLD = 3
export const LEARNING_DAILY_ADJUSTMENT_CAP = 15
type AdjustmentField = 'objectiveImportanceAdjustment' | 'taskEstimateAdjustment' | 'appClassificationAdjustment' | 'siteClassificationAdjustment' | 'userPreferenceAdjustment' | 'confidenceChange'
const ADJUSTMENT_FIELDS: AdjustmentField[] = ['objectiveImportanceAdjustment','taskEstimateAdjustment','appClassificationAdjustment','siteClassificationAdjustment','userPreferenceAdjustment','confidenceChange']

/** Applies repetition and daily safety limits before a learning signal may affect stored models. */
export function gateLearningUpdate(update: LearningUpdate, history: readonly LearningUpdate[]): LearningUpdate {
  const day = update.createdAt.slice(0, 10)
  const next: LearningUpdate = { ...update, reasons: [...update.reasons], debug: { ...update.debug, appliedToStoredData: false } }
  for (const field of ADJUSTMENT_FIELDS) {
    const requested = update[field]
    if (!requested) continue
    const sameDirection = history.filter((item) => item.targetType === update.targetType && item.targetId === update.targetId && Math.sign(item[field] ?? 0) === Math.sign(requested))
    if (sameDirection.length + 1 < LEARNING_REPEAT_THRESHOLD) {
      delete next[field]
      next.reasons.push(`Signal conservé : ${LEARNING_REPEAT_THRESHOLD} occurrences cohérentes sont requises avant application.`)
      continue
    }
    const usedToday = history.filter((item) => item.createdAt.startsWith(day)).reduce((sum, item) => sum + Math.abs(item[field] ?? 0), 0)
    const allowed = Math.max(0, LEARNING_DAILY_ADJUSTMENT_CAP - usedToday)
    const effective = Math.sign(requested) * Math.min(Math.abs(requested), allowed)
    if (!effective) delete next[field]
    else next[field] = effective
  }
  const applied = ADJUSTMENT_FIELDS.some((field) => Boolean(next[field]))
  next.debug = { ...next.debug, appliedToStoredData: applied, repeatThreshold: LEARNING_REPEAT_THRESHOLD, dailyCap: LEARNING_DAILY_ADJUSTMENT_CAP }
  return next
}

export type LearningEvent = {
  kind:
    | 'session_completed'
    | 'session_abandoned'
    | 'manual_objective_choice'
    | 'app_allowed_manually'
    | 'site_allowed_manually'
    | 'unlock_denied'
    | 'task_ignored'
  targetType?: LearningUpdate['targetType']
  targetId?: string
  plannedMinutes?: number
  actualMinutes?: number
  confidence?: number
  appId?: string
  siteId?: string
  useful?: boolean
  createdAt?: string
}

export type UnlockRequestLike = {
  targetType?: 'app' | 'site'
  targetId?: string
  appId?: string
  siteId?: string
  explanation?: string
  createdAt?: string
}

export type UnlockDecisionLike = {
  decision: 'allowed' | 'denied' | 'coach_error'
  confidence?: number
}

function nowIso(): string {
  return new Date().toISOString()
}

function clampAdjustment(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(-30, Math.min(30, Math.round(value)))
}

export function buildLearningUpdateFromEvent(
  event: LearningEvent,
  context: { createdAt?: string } = {},
): LearningUpdate {
  const reasons: string[] = []
  const update: LearningUpdate = {
    source: event.kind.includes('unlock') ? 'unlock_request' : event.kind.includes('app') || event.kind.includes('site') ? 'usage_event' : 'session',
    targetType: event.targetType,
    targetId: event.targetId,
    reasons,
    createdAt: event.createdAt ?? context.createdAt ?? nowIso(),
    debug: { appliedToStoredData: false, eventKind: event.kind },
  }

  if (event.kind === 'session_completed' && event.plannedMinutes && event.actualMinutes) {
    const ratio = event.actualMinutes / Math.max(1, event.plannedMinutes)
    if (ratio <= 0.75) {
      update.taskEstimateAdjustment = clampAdjustment(-10)
      reasons.push('La session a été terminée plus vite que prévu.')
    } else if (ratio >= 1.25) {
      update.taskEstimateAdjustment = clampAdjustment(10)
      reasons.push('La session a demandé plus de temps que prévu.')
    } else {
      reasons.push('La session confirme une estimation assez fiable.')
    }
  }

  if (event.kind === 'manual_objective_choice') {
    update.objectiveImportanceAdjustment = 8
    update.userPreferenceAdjustment = 6
    reasons.push('L’utilisateur montre une préférence forte pour cet objectif.')
  }

  if (event.kind === 'app_allowed_manually') {
    update.appClassificationAdjustment = event.useful === false ? -8 : 8
    reasons.push(
      event.useful === false
        ? 'L’app demandée semble risquée dans ce contexte.'
        : 'L’app semble utile dans ce contexte.',
    )
  }

  if (event.kind === 'site_allowed_manually') {
    update.siteClassificationAdjustment = event.useful === false ? -8 : 8
    reasons.push(
      event.useful === false
        ? 'Le site demandé semble risqué dans ce contexte.'
        : 'Le site semble utile dans ce contexte.',
    )
  }

  if (event.kind === 'unlock_denied') {
    update.confidenceChange = 5
    reasons.push('Une demande de déblocage a été refusée.')
  }

  if (event.kind === 'task_ignored' || event.kind === 'session_abandoned') {
    update.confidenceChange = -4
    reasons.push('Vethos détecte un signal d’évitement ou d’abandon.')
  }

  if (reasons.length === 0) reasons.push('Signal conservé pour apprentissage futur.')
  return update
}

export function buildLearningUpdatesFromSession(
  session: { completedNormally?: boolean; durationMinutes?: number; plannedMinutes?: number; endedAt?: string },
  task?: Task | null,
  objective?: Objective | null,
  usageEvents: LearningEvent[] = [],
): LearningUpdate[] {
  const updates: LearningUpdate[] = []
  if (task) {
    updates.push(
      buildLearningUpdateFromEvent({
        kind: session.completedNormally === false ? 'session_abandoned' : 'session_completed',
        targetType: 'task',
        targetId: task.id,
        plannedMinutes: session.plannedMinutes ?? task.estimatedMinutes,
        actualMinutes: session.durationMinutes,
        createdAt: session.endedAt,
      }),
    )
  }
  if (objective) {
    updates.push(
      buildLearningUpdateFromEvent({
        kind: session.completedNormally === false ? 'session_abandoned' : 'manual_objective_choice',
        targetType: 'objective',
        targetId: objective.id,
        createdAt: session.endedAt,
      }),
    )
  }
  updates.push(...usageEvents.map((event) => buildLearningUpdateFromEvent(event)))
  return updates
}

export function buildLearningUpdatesFromUnlockRequest(
  request: UnlockRequestLike,
  decision: UnlockDecisionLike,
  context: { createdAt?: string } = {},
): LearningUpdate[] {
  const targetType = request.targetType ?? (request.appId ? 'app' : request.siteId ? 'site' : undefined)
  const targetId = request.targetId ?? request.appId ?? request.siteId
  return [
    buildLearningUpdateFromEvent(
      {
        kind: decision.decision === 'denied' ? 'unlock_denied' : targetType === 'site' ? 'site_allowed_manually' : 'app_allowed_manually',
        targetType,
        targetId,
        useful: decision.decision === 'allowed',
        confidence: decision.confidence,
        createdAt: request.createdAt,
      },
      context,
    ),
  ]
}
