import { useMemo } from 'react'
import { useScheduleStore } from '@/store/schedule.store'
import { useTasksStore } from '@/store/tasks.store'
import { useLevelsStore } from '@/store/levels.store'
import { useSettingsStore } from '@/store/settings.store'
import { useAncresStore } from '@/store/ancres.store'
import { useLearningStore } from '@/store/learning.store'
import { computePlan } from './planning/engine'
import { computeFreeTimeSlots } from './free-time-calculator'
import type { PlanningInput, TimeSlot, PlanningResult } from './planning/types'

function parseClockTimeToMinute(clock: string): number {
  const [h, m] = clock.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

function localDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Hook qui alimente le moteur de planification avec les stores et retourne
 * le PlanningResult. Recalculé via useMemo dès qu'une dépendance change
 * (tâches, objectifs, ancres, planning, settings, learning).
 *
 * B.4.1 : redéclenchement automatique — toute modification d'état
 * recalcule le plan, y compris fin en avance.
 */
export function usePlanning(now: Date = new Date()): PlanningResult | null {
  const tasks = useTasksStore((s) => s.tasks)
  const objectives = useLevelsStore((s) => s.objectives)
  const ancres = useAncresStore((s) => s.ancres)
  const rules = useScheduleStore((s) => s.rules)
  const entries = useScheduleStore((s) => s.entries)
  const sleepStart = useSettingsStore((s) => s.sleepStart)
  const sleepEnd = useSettingsStore((s) => s.sleepEnd)
  const observations = useLearningStore((s) => s.observations)
  const anchorMissCounts = useLearningStore((s) => s.anchorMissCounts)

  return useMemo(() => {
    const today = localDateKey(now)
    const rangeEnd = localDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 6))

    // Calculer la capacité brute par jour (A.1) depuis le schedule.
    const dayOfWeek = (now.getDay() + 6) % 7 // 0=lundi

    // Construire les fixedSlots depuis le schedule.
    const wakeMinute = parseClockTimeToMinute(sleepEnd || '07:00')
    const fixedSlots: TimeSlot[] = []

    // Pour chaque jour de la semaine, calculer les créneaux libres.
    const dailyRawCapacity: Array<{ date: string; minutes: number }> = []
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset)
      const dateStr = localDateKey(date)
      const dow = (date.getDay() + 6) % 7

      // Créneaux libres du jour (déduit des entries).
      const dayEntries = entries.filter((e) => e.dayOfWeek === dow)
      const freeSlots = computeFreeTimeSlots(dow, entries, rules)
      const rawMinutes = freeSlots.filter((s) => !s.isPreparation).reduce((sum, s) => sum + s.durationMinutes, 0)

      dailyRawCapacity.push({ date: dateStr, minutes: rawMinutes })

      // Ajouter les créneaux libres comme TimeSlot.
      for (const fs of freeSlots) {
        if (fs.isPreparation) continue
        fixedSlots.push({
          startMinute: fs.startMinute,
          endMinute: fs.endMinute,
          durationMinutes: fs.durationMinutes,
          cognitiveWindow: 'NORMALE' as const,
        })
      }
    }

    const input: PlanningInput = {
      today,
      rangeEnd,
      tasks,
      objectives,
      ancres,
      fixedSlots,
      dailyRawCapacity,
      observations: observations.map((o) => ({
        taskId: o.taskId,
        category: o.category,
        estimatedMinutes: o.estimatedMinutes,
        actualMinutes: o.actualMinutes,
        startHour: o.startHour,
        completed: o.completed,
        createdAt: o.createdAt,
      })),
      anchorMissCounts,
    }

    try {
      return computePlan(input)
    } catch (err) {
      console.error('[usePlanning] computePlan error', err)
      return null
    }
  }, [tasks, objectives, ancres, rules, entries, sleepStart, sleepEnd, observations, anchorMissCounts, now])
}
