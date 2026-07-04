export type ExecutionPreviewSessionSnapshot = {
  id: string
  targetType: 'task' | 'objective' | 'session'
  targetId?: string
  taskId?: string
  objectiveId?: string
  startedAt?: string
  endedAt?: string
  start?: string
  end?: string
  durationMinutes?: number
  status?: string
  label?: string
  locked?: boolean
}

export function normalizeExecutionPreviewSessions(
  sessions: readonly unknown[] | undefined,
): ExecutionPreviewSessionSnapshot[] {
  if (!Array.isArray(sessions)) return []

  return sessions.flatMap((session) => {
    if (!isRecord(session)) return []
    const plan = isRecord(session.plan) ? session.plan : undefined
    const integrity = isRecord(session.integrity) ? session.integrity : undefined

    if (plan) {
      const id = asString(plan.id)
      if (!id) return []
      const rawTargetType = asString(plan.targetType)
      const targetType: ExecutionPreviewSessionSnapshot['targetType'] =
        rawTargetType === 'task' || rawTargetType === 'objective' ? rawTargetType : 'session'
      const targetId = asString(plan.targetId)
      const startedAt = asString(session.startedAt)
      const endedAt = asString(session.endedAt)
      const plannedStart = dateTime(asString(plan.date), asString(plan.plannedStart))
      const plannedEnd = dateTime(asString(plan.date), asString(plan.plannedEnd))
      const measuredMinutes = finiteNonNegative(integrity?.activeDurationMinutes)

      return [{
        id,
        targetType,
        targetId,
        taskId: asString(plan.linkedTaskId) ?? (targetType === 'task' ? targetId : undefined),
        objectiveId:
          asString(plan.linkedObjectiveId) ?? (targetType === 'objective' ? targetId : undefined),
        startedAt,
        endedAt,
        start: startedAt ?? plannedStart,
        end: endedAt ?? plannedEnd,
        durationMinutes: measuredMinutes ?? durationBetween(startedAt, endedAt),
        status: asString(session.state),
        label: asString(plan.title),
        locked: asString(session.state) === 'active',
      }]
    }

    const id = asString(session.id)
    if (!id) return []
    const rawTargetType = asString(session.targetType)
    const targetType: ExecutionPreviewSessionSnapshot['targetType'] =
      rawTargetType === 'task' || rawTargetType === 'objective' ? rawTargetType : 'session'
    const startedAt = asString(session.startedAt)
    const endedAt = asString(session.endedAt)
    return [{
      id,
      targetType,
      targetId: asString(session.targetId),
      taskId: asString(session.taskId),
      objectiveId: asString(session.objectiveId),
      startedAt,
      endedAt,
      start: asString(session.start) ?? startedAt,
      end: asString(session.end) ?? endedAt,
      durationMinutes: finiteNonNegative(session.durationMinutes) ?? durationBetween(startedAt, endedAt),
      status: asString(session.status),
      label: asString(session.label),
      locked: session.locked === true,
    }]
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function finiteNonNegative(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

function dateTime(date: string | undefined, clock: string | undefined): string | undefined {
  if (!date || !clock) return undefined
  return `${date}T${clock.length === 5 ? `${clock}:00` : clock}`
}

function durationBetween(start: string | undefined, end: string | undefined): number | undefined {
  if (!start || !end) return undefined
  const duration = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000)
  return Number.isFinite(duration) && duration >= 0 ? duration : undefined
}
