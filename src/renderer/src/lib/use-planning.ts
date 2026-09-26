import { joursLibresPris } from '@shared/planning/jours-libres'
import { useMemo } from 'react'
import { usePlanningStore } from '@/store/planning.store'
import { useSettingsStore } from '@/store/settings.store'
import { computePlan, PLANNING_HORIZON_DAYS } from '@shared/planning/engine'
import { addDays, dateKey } from '@shared/planning/dates'
import { activeConfirmedSession } from '@shared/planning/session'
import { sleepScheduleEntries } from '@shared/sleep'
import type { PlanningInput, PlanningResult } from '@shared/planning/types'

export { PLANNING_HORIZON_DAYS }

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
  const sessionConfirmations = usePlanningStore((s) => s.sessionConfirmations)
  const sleepStart = useSettingsStore((s) => s.sleepStart)
  const sleepEnd = useSettingsStore((s) => s.sleepEnd)

  const nowMs = now.getTime()

  return useMemo(() => {
    const at = new Date(nowMs)
    const today = dateKey(at)
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
      consecutiveDelays: learning.consecutiveDelays,
      // Le journal des séances : rampe, durées apprises, Thompson (spec 2026-09-25).
      sessionEvents: learning.sessionEvents,
      // Jours libres pris : le même plan que le processus main.
      freeDays: joursLibresPris(learning),
      // D.7 : le retard est une MESURE de la confirmation « Je commence », pas
      // une déduction du moteur. Tant que rien n'est mesuré pour un jour, il
      // n'y a pas de retard — surtout pas un retard supposé (G.3).
      confirmationSource: {
        getDelayMinutes: (date) => learning.dailyDelayMinutes[date] ?? 0,
        // D.8 : le non-démarrage par bloc viendra du composant de confirmation
        // lui-même. Tant qu'il n'existe pas, aucun bloc n'est déclaré manqué —
        // le moteur ne l'invente pas.
        wasNeverConfirmed: () => false,
      },
      // B.5.2 : le temps réellement travaillé, mesuré par l'horloge du
      // processus main. Sans lui, l'écran montrerait un travail restant qui ne
      // baisse jamais pendant qu'on travaille.
      durationSource: {
        getActualMinutes: (taskId) => learning.workedMinutesByRef[taskId] ?? null,
      },
      // D.7 : MÊME session épinglée que le processus main. C'est la condition
      // pour que les deux calculent le même plan — donc les mêmes identifiants
      // de bloc. Sans elle, l'écran replaçait le bloc en cours à « maintenant »
      // pendant que le main le gardait à son heure réelle, et « Je commence »
      // renvoyait « ce bloc ne fait plus partie du plan » sur un bloc pourtant
      // bien présent (défaut réel du 2026-08-23).
      activeSession: activeConfirmedSession(
        sessionConfirmations,
        today,
        at.getHours() * 60 + at.getMinutes(),
      ),
    }

    return computePlan(input, at)
  }, [
    tasks,
    objectives,
    ancres,
    schedule,
    learning,
    sessionConfirmations,
    sleepStart,
    sleepEnd,
    nowMs,
  ])
}
