import { listProcesses } from './enumerator'
import { killByImageName } from './killer'
import { isSafeListed } from './safe-list'
import log from '@main/logging/setup'

const wlog = log.scope('process-watcher')

export type WatcherHandle = { stop: () => void }

/**
 * Démarre un watcher qui tue toutes les secondes les processus dont le nom
 * (insensible à la casse) appartient à `forbidden`. Refuse les noms safe-listed.
 */
export function startProcessWatcher(forbidden: string[]): WatcherHandle {
  const set = new Set(
    forbidden.map((n) => n.toLowerCase()).filter((n) => !isSafeListed(n)),
  )
  let cancelled = false

  const tick = async () => {
    if (cancelled) return
    try {
      const procs = await listProcesses()
      const seen = new Set<string>()
      for (const p of procs) {
        if (set.has(p.name) && !seen.has(p.name)) {
          seen.add(p.name)
          await killByImageName(p.name).catch(() => {
            wlog.warn('kill failed, will retry', p.name)
          })
        }
      }
    } catch (err) {
      wlog.error('tick failed', err)
    }
  }

  const id = setInterval(tick, 1000)
  void tick()

  return {
    stop: () => {
      cancelled = true
      clearInterval(id)
    },
  }
}
