import { useMemo } from 'react'
import { usePlanningStore } from '@/store/planning.store'
import { useSettingsStore } from '@/store/settings.store'
import { computePlan } from './planning/engine'
import { addDays, dateKey } from './planning/dates'
import { sleepScheduleEntries } from '@shared/sleep'
import type { PlanningInput, PlanningResult } from './planning/types'

/** Horizon du plan : la semaine qui vient, aujourd'hui inclus. */
export const PLANNING_HORIZON_DAYS = 6

/**
 * Alimente le moteur avec ce que le store contient réellement, et rien
 * d'autre. Le sommeil vient d'une seule source — les heures des paramètres —
 * transformées en entrées d'emploi du temps pour la capacité brute (A.1).
 */
export function usePlanning(now: Date = new Date()): PlanningResult | null {
  const tasks = usePlanningStore((s) => s.tasks)
  const objectives = usePlanningStore((s) => s.objectives)
  const ancres = usePlanningStore((s) => s.ancres)
  const schedule = usePlanningStore((s) => s.schedule)
  const learning = usePlanningStore((s) => s.learning)
  const sleepStart = useSettingsStore((s) => s.sleepStart)
  const sleepEnd = useSettingsStore((s) => s.sleepEnd)

  const nowMs = now.getTime()

  return useMemo(() => {
    const today = dateKey(new Date(nowMs))
    const input: PlanningInput = {
      today,
      rangeEnd: addDays(today, PLANNING_HORIZON_DAYS),
      tasks,
      objectives,
      ancres,
      schedule: [...sleepScheduleEntries(sleepStart, sleepEnd), ...schedule],
      observations: learning.observations,
      anchorMissCounts: learning.anchorMissCounts,
      dailyUtilization: learning.dailyUtilization,
      weeklyObjectiveServed: learning.weeklyObjectiveServed,
      objectiveLastServed: learning.objectiveLastServed,
      lastSignalAt: learning.lastSignalAt,
      tasksCreatedPerWeek: learning.tasksCreatedPerWeek,
    }

    return computePlan(input, new Date(nowMs))
  }, [tasks, objectives, ancres, schedule, learning, sleepStart, sleepEnd, nowMs])
}
