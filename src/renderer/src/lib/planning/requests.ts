import { computeDensities } from './feasibility'

// ═══ PARTIE E.5 — SYSTÈME DE DEMANDE ═════════════════════════════════════

export type UserRequest = {
  type: 'rest' | 'free_time' | 'postpone_task' | 'reduce_task'
  minutes?: number
  taskId?: string
  date?: string
}

export type RequestVerdict = {
  status: 'granted' | 'partial' | 'denied'
  grantedMinutes: number
  reason: string
  deficitMinutes?: number
  safeVersion?: UserRequest
}

/** E.5 : évaluer une demande utilisateur. */
export function evaluateRequest(args: {
  request: UserRequest
  tasks: Array<{ taskId: string; deadline: string; remainingMinutes: number }>
  cumulativeCapacity: Array<{ date: string; capacityMinutes: number }>
  today: string
  touchesAbsoluteRule?: boolean
}): RequestVerdict {
  if (args.touchesAbsoluteRule) {
    return {
      status: 'denied', grantedMinutes: 0,
      reason: 'Demande refusée : touche une règle absolue (sommeil ou ancre).',
      safeVersion: { ...args.request, minutes: Math.round((args.request.minutes ?? 0) * 0.5) },
    }
  }

  const adjCap = args.request.minutes && args.request.type !== 'postpone_task' && args.request.type !== 'reduce_task'
    ? args.cumulativeCapacity.map((c) => c.date === (args.request.date ?? args.today) ? { ...c, capacityMinutes: Math.max(0, c.capacityMinutes - args.request.minutes!) } : c)
    : args.cumulativeCapacity

  const adjTasks = args.request.type === 'reduce_task' && args.request.taskId
    ? args.tasks.map((t) => t.taskId === args.request.taskId ? { ...t, remainingMinutes: Math.max(0, t.remainingMinutes - (args.request.minutes ?? 0)) } : t)
    : args.request.type === 'postpone_task' && args.request.taskId
    ? args.tasks.filter((t) => t.taskId !== args.request.taskId)
    : args.tasks

  const densities = computeDensities({ tasks: adjTasks, cumulativeCapacity: adjCap, today: args.today })
  const maxDensity = Math.max(...densities.map((d) => d.density), 0)

  if (maxDensity <= 1) {
    return { status: 'granted', grantedMinutes: args.request.minutes ?? 0, reason: 'Accordée — faisabilité préservée.' }
  }

  const infeasible = densities.find((d) => d.density > 1)
  const deficit = infeasible ? infeasible.loadMinutes - infeasible.capacityMinutes : 0
  const safe = Math.max(0, (args.request.minutes ?? 0) - deficit)

  return {
    status: safe > 0 ? 'partial' : 'denied',
    grantedMinutes: safe,
    reason: `Refusée : densité > 1 (déficit ${deficit} min). La marge de sécurité d'une tâche ne s'échange pas contre du confort.`,
    deficitMinutes: deficit,
    safeVersion: { ...args.request, minutes: safe },
  }
}
