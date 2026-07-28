import type { FeasibilityResult } from './types'
import { computeDensities } from './feasibility'

/**
 * Partie E.5 — Système de demande.
 *
 * Pas un simple interrupteur on/off. L'utilisateur peut demander quelque chose
 * (repos, temps libre, etc.). Le moteur évalue la demande en recalculant toute
 * la semaine comme si elle était accordée.
 *
 * RÈGLE ABSOLUE : la marge de sécurité prouvée d'une tâche n'est jamais
 * échangeable contre du confort personnel.
 */

export type RequestType = 'rest' | 'free_time' | 'postpone_task' | 'reduce_task'

export type UserRequest = {
  type: RequestType
  /** Minutes demandées (pour repos/temps libre) ou taskId (pour postpone/reduce). */
  minutes?: number
  taskId?: string
  date?: string
  description?: string
}

export type RequestVerdict = {
  /** 'granted' = accordée sans coût. 'partial' = version réduite accordée. 'denied' = refusée. */
  status: 'granted' | 'partial' | 'denied'
  /** Minutes réellement accordées (peut être < demandé en cas de 'partial'). */
  grantedMinutes: number
  /** Raison de la décision. */
  reason: string
  /** Déficit chiffré si la demande causerait density > 1. */
  deficitMinutes?: number
  /** La plus grande version de la demande qui reste dans les limites sûres. */
  safeVersion?: UserRequest
}

/**
 * E.5 : évaluer une demande utilisateur.
 *
 * 1. Demande touche une règle absolue (sommeil, ancre) → jamais accordée telle quelle.
 *    Proposer l'alternative la plus proche.
 * 2. Sinon : recalculer la semaine comme si accordée.
 * 3. Densité ≤ 1 partout → accordée.
 * 4. Densité > 1 → jamais accordée telle quelle. Produire le déficit + la plus
 *    grande version sûre.
 */
export function evaluateRequest(args: {
  request: UserRequest
  /** État actuel des tâches + capacités (pour recalculer). */
  tasks: Array<{ taskId: string; title: string; deadline: string; remainingMinutes: number }>
  cumulativeCapacity: Array<{ date: string; capacityMinutes: number }>
  today: string
  /** Règle absolue : ne jamais échanger la marge de sécurité d'une tâche contre du confort. */
  touchesAbsoluteRule?: boolean
}): RequestVerdict {
  const { request, tasks, cumulativeCapacity, today } = args

  // 1. Demande touche une règle absolue → jamais accordée telle quelle.
  if (args.touchesAbsoluteRule) {
    return {
      status: 'denied',
      grantedMinutes: 0,
      reason: 'Cette demande touche une règle absolue (sommeil ou ancre). Proposition d\'alternative la plus proche.',
      safeVersion: { ...request, minutes: Math.round((request.minutes ?? 0) * 0.5) },
    }
  }

  // 2. Recalculer avec la demande appliquée.
  // Pour repos/free_time : retirer les minutes demandées de la capacité.
  const adjustedCapacity = request.minutes && request.type !== 'postpone_task' && request.type !== 'reduce_task'
    ? cumulativeCapacity.map((c) => ({
        date: c.date,
        capacityMinutes: c.date === (request.date ?? today)
          ? Math.max(0, c.capacityMinutes - request.minutes!)
          : c.capacityMinutes,
      }))
    : cumulativeCapacity

  // Pour postpone/reduce : ajuster les tâches.
  const adjustedTasks = request.type === 'reduce_task' && request.taskId
    ? tasks.map((t) => t.taskId === request.taskId
        ? { ...t, remainingMinutes: Math.max(0, t.remainingMinutes - (request.minutes ?? 0)) }
        : t)
    : request.type === 'postpone_task' && request.taskId
    ? tasks.filter((t) => t.taskId !== request.taskId)
    : tasks

  // 3. Vérifier la densité.
  const densities = computeDensities({
    tasks: adjustedTasks,
    cumulativeCapacity: adjustedCapacity,
    today,
  })

  const maxDensity = Math.max(...densities.map((d) => d.density), 0)

  if (maxDensity <= 1) {
    // Accordée.
    return {
      status: 'granted',
      grantedMinutes: request.minutes ?? 0,
      reason: 'Demande accordée — la faisabilité reste prouvée (densité ≤ 1).',
    }
  }

  // 4. Density > 1 : jamais accordée telle quelle.
  // Calculer le déficit.
  const infeasible = densities.find((d) => d.density > 1)
  const deficitMinutes = infeasible ? infeasible.loadMinutes - infeasible.capacityMinutes : 0

  // La plus grande version sûre : réduire les minutes demandées.
  const safeMinutes = Math.max(0, (request.minutes ?? 0) - deficitMinutes)

  return {
    status: safeMinutes > 0 ? 'partial' : 'denied',
    grantedMinutes: safeMinutes,
    reason: `Demande refusée telle quelle — densité > 1 (déficit: ${deficitMinutes} min). La marge de sécurité d'une tâche ne peut pas être échangée contre du confort personnel.`,
    deficitMinutes,
    safeVersion: { ...request, minutes: safeMinutes },
  }
}
