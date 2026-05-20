import { useMemo } from 'react'
import { useScheduleStore } from '@/store/schedule.store'
import { useLevelsStore } from '@/store/levels.store'
import { useTasksStore } from '@/store/tasks.store'
import { useSettingsStore } from '@/store/settings.store'
import {
  computePlacement,
  enumerateDates,
  summarizeDailyLoad,
  type DailyLoad,
  type PlacedBlock,
} from './placement-engine'

export function localDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Dérive le plan (`PlacedBlock[]`) et la charge quotidienne (`DailyLoad[]`)
 * sur la plage [today, rangeEndStr], à partir des stores Nexus. Recalculé via
 * `useMemo` dès qu'une entrée change (tâches, objectifs, planning, niveau de
 * temps libre, date du jour, plage demandée). Réf. spec §9, §10.
 *
 * Le composant appelant passe `now` (typiquement un `useState(new Date())` avec
 * `setInterval` 60s) pour faire glisser la fenêtre au passage d'un jour.
 */
export function usePlacement(
  now: Date,
  rangeEndStr: string,
): {
  blocks: PlacedBlock[]
  dailyLoad: DailyLoad[]
  todayStr: string
  dates: string[]
} {
  const tasks = useTasksStore((s) => s.tasks)
  const objectives = useLevelsStore((s) => s.objectives)
  const rules = useScheduleStore((s) => s.rules)
  const entries = useScheduleStore((s) => s.entries)
  const freeTimeLevel = useSettingsStore((s) => s.freeTimeLevel)
  const todayStr = localDateKey(now)

  return useMemo(() => {
    const blocks = computePlacement({
      tasks,
      objectives,
      rules,
      entries,
      freeTimeLevel,
      todayStr,
      rangeEndStr,
    })
    const dates = enumerateDates(todayStr, rangeEndStr)
    const dailyLoad = summarizeDailyLoad(blocks, dates, entries, rules)
    return { blocks, dailyLoad, todayStr, dates }
  }, [tasks, objectives, rules, entries, freeTimeLevel, todayStr, rangeEndStr])
}
