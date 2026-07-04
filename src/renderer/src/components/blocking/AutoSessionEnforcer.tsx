import { useEffect, useRef } from 'react'
import { useTasksStore } from '../../store/tasks.store'
import { useBlockingStore } from '../../store/blocking.store'
import { useLevelsStore } from '../../store/levels.store'
import { useToast } from '../../lib/use-toast'

const AUTO_PROFILE_ID = '00000000-0000-0000-0000-000000000000'

export function AutoSessionEnforcer() {
  const { tasks } = useTasksStore()
  const { active, startSession, saveProfile } = useBlockingStore()
  const { calculatedDailyFreeMinutes, setCalculatedFreeTime } = useLevelsStore()
  const toast = useToast()

  const processedTasksRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const interval = setInterval(() => {
      if (active) return

      const now = new Date()
      const nowTime = now.getTime()

      for (const task of tasks) {
        if (!task.scheduledStart || !task.scheduledDurationMinutes || task.status !== 'active') {
          continue
        }

        const taskStart = new Date(task.scheduledStart)
        const startTime = taskStart.getTime()
        const endTime = startTime + task.scheduledDurationMinutes * 60_000

        if (nowTime < startTime || nowTime >= endTime) {
          continue
        }

        if (!processedTasksRef.current.has(task.id)) {
          processedTasksRef.current.add(task.id)

          const delayMinutes = Math.floor((nowTime - startTime) / 60_000)
          let finalDuration = task.scheduledDurationMinutes - delayMinutes

          if (delayMinutes > 0) {
            const freeTime = calculatedDailyFreeMinutes
            if (freeTime > 0) {
              const compensation = Math.min(delayMinutes, freeTime)
              finalDuration += compensation
              const todayStr = new Date().toISOString().split('T')[0] as string
              void setCalculatedFreeTime(Math.max(0, freeTime - compensation), todayStr)
              
              toast.success({
                title: 'Session décalée',
                description: `Vous aviez ${delayMinutes} min de retard. La fin de session a été repoussée en consommant ${compensation} min de votre temps libre.`
              })
            } else {
              toast.info({
                title: 'Session amputée',
                description: `Vous avez ${delayMinutes} min de retard et plus de temps libre. La session finira à l'heure initiale.`
              })
            }
          }

          if (finalDuration > 0) {
            const blockingConfig = task.blocking || {
              enabled: true,
              mode: 'blocklist',
              sites: [],
              processes: [],
              networkApps: [],
              unlockPolicy: { type: 'none' }
            }

            void saveProfile({
              id: AUTO_PROFILE_ID,
              name: `Session: ${task.title}`,
              mode: blockingConfig.mode as 'blocklist' | 'allowlist',
              blockedSites: blockingConfig.sites,
              blockedProcesses: blockingConfig.processes,
              blockedNetworkApps: blockingConfig.networkApps,
              unlockPolicy: blockingConfig.unlockPolicy,
            }).then(() => {
              void startSession(AUTO_PROFILE_ID, finalDuration)
              if (delayMinutes === 0) {
                toast.success({
                  title: 'Session automatique',
                  description: `La session pour "${task.title}" vient de démarrer !`
                })
              }
            })
          }
        }
      }
    }, 10_000)

    return () => clearInterval(interval)
  }, [tasks, active, calculatedDailyFreeMinutes, setCalculatedFreeTime, saveProfile, startSession, toast])

  return null
}
