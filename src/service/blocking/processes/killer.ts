import { execFile } from 'node:child_process'
import log from '../engine-log'
import { listProcesses } from './enumerator'
import { isSafeListed } from './safe-list'

export type ProcessKillerHandle = {
  stop: () => void
}

function normalizeExeName(value: string): string {
  return value.trim().replace(/^.*[\\/]/u, '').toLowerCase()
}

function killPid(pid: number, exeName: string): void {
  execFile(
    'taskkill.exe',
    ['/PID', String(pid), '/F'],
    { windowsHide: true },
    (err) => {
      if (err) log.warn('[blocking] process kill failed', { exeName, pid, err })
    },
  )
}

export function startProcessKiller(
  forbiddenExeNames: string[],
  intervalMs = 1000,
): ProcessKillerHandle {
  const forbidden = new Set(
    forbiddenExeNames
      .map(normalizeExeName)
      .filter((name) => name.endsWith('.exe') && !isSafeListed(name)),
  )

  if (forbidden.size === 0) return { stop: () => undefined }

  const tick = async (): Promise<void> => {
    const processes = await listProcesses()
    for (const process of processes) {
      if (forbidden.has(process.name.toLowerCase())) {
        killPid(process.pid, process.name)
      }
    }
  }

  const id = setInterval(() => {
    tick().catch((err) => log.error('[blocking] process killer tick failed', err))
  }, intervalMs)
  void tick().catch((err) => log.error('[blocking] process killer initial tick failed', err))

  return {
    stop: () => clearInterval(id),
  }
}
