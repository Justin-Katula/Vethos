import { useMemo } from 'react'
import { usePlanningStore } from '@/store/planning.store'
import { computePlan } from './planning/engine'
import type { PlanningInput, PlanningResult } from './planning/types'

function localDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Hook qui alimente le moteur avec les données du store et retourne le plan.
 * Recalculé via useMemo à chaque changement.
 */
export function usePlanning(now: Date = new Date()): PlanningResult | null {
  const tasks = usePlanningStore((s) => s.tasks)
  const objectives = usePlanningStore((s) => s.objectives)
  const ancres = usePlanningStore((s) => s.ancres)
  const schedule = usePlanningStore((s) => s.schedule)

  return useMemo(() => {
    const today = localDateKey(now)
    const end = new Date(now)
    end.setDate(end.getDate() + 6)
    const rangeEnd = localDateKey(end)

    const input: PlanningInput = {
      today,
      rangeEnd,
      tasks,
      objectives,
      ancres,
      schedule,
      observations: [],
      anchorMissCounts: {},
    }

    try {
      return computePlan(input)
    } catch (err) {
      console.error('[usePlanning] error', err)
      return null
    }
  }, [tasks, objectives, ancres, schedule, now])
}

export { localDateKey }
