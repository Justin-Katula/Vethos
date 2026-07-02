import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { SLEEP_LOCKDOWN_PROCESS_MARKER } from '@shared/blocking'
import log from '../engine-log'
import { listProcesses } from './enumerator'
import { isSafeListed } from './safe-list'

export type ProcessKillerHandle = {
  stop: () => void
}

export type ProcessKillerAttempt = {
  processName: string
  pid: number
  blockAll: boolean
}

export type ProcessKillerAttemptHandler = (attempt: ProcessKillerAttempt) => void
export type ProcessFilterMode = 'blocklist' | 'allowlist'
export type ProcessKillerOptions = {
  mode?: ProcessFilterMode
  allowedExeNames?: string[]
}

/** Délai réservé aux modes qui doivent filtrer les processus sans fenêtre. */
export const MANUAL_CLOSE_GRACE_MS = 250

function normalizeExeName(value: string): string {
  return value.trim().replace(/^.*[\\/]/u, '').toLowerCase()
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function processHasVisibleWindow(pid: number): Promise<boolean> {
  return new Promise((resolve) => {
    const helperPath = join(__dirname, 'ProcessWindowHelper.exe')
    execFile(
      helperPath,
      ['visible', String(pid)],
      { windowsHide: true },
      (err, stdout) => {
        if (!err) {
          const result = String(stdout).trim().toLowerCase()
          if (result === 'visible' || result === 'hidden') {
            resolve(result === 'visible')
            return
          }
        }

        // Fallback to powershell if c# helper failed/crashed
        const script = `$p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if ($p -and ($p.MainWindowHandle -ne 0 -or ($p.Path -and $p.Path -like '*\\WindowsApps\\*'))) { 'visible' } else { 'hidden' }`
        execFile(
          'powershell.exe',
          ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
          { windowsHide: true },
          (err2, stdout2) => {
            if (err2) {
              log.warn('[blocking] visible window check fallback failed', { pid, err: err2 })
              resolve(false)
              return
            }
            resolve(String(stdout2).trim().toLowerCase() === 'visible')
          },
        )
      },
    )
  })
}

export async function shouldCloseDetectedProcess(args: {
  processName: string
  pid: number
  mode: ProcessFilterMode
  blockAll: boolean
  forbidden: Set<string>
  allowed: Set<string>
  visibleWindowCheck?: (pid: number) => Promise<boolean>
}): Promise<boolean> {
  const processName = normalizeExeName(args.processName)
  if (!processName || isSafeListed(processName)) return false

  if (args.mode === 'allowlist') {
    if (args.allowed.has(processName)) return false
    await delay(MANUAL_CLOSE_GRACE_MS)
    return args.visibleWindowCheck
      ? args.visibleWindowCheck(args.pid)
      : processHasVisibleWindow(args.pid)
  }

  if (!args.blockAll && !args.forbidden.has(processName)) return false
  // Une entrée explicite de blocklist est relayée immédiatement. Le service
  // tourne en Session 0 et ne peut pas déterminer la fenêtre utilisateur de
  // façon fiable; Electron fera cette validation dans la bonne session.
  if (!args.blockAll) return true
  await delay(MANUAL_CLOSE_GRACE_MS)
  return args.visibleWindowCheck
    ? args.visibleWindowCheck(args.pid)
    : processHasVisibleWindow(args.pid)
}

export function startProcessKiller(
  forbiddenExeNames: string[],
  intervalMs = 100,
  onBlocked?: ProcessKillerAttemptHandler,
  options: ProcessKillerOptions = {},
): ProcessKillerHandle {
  const rawForbidden = forbiddenExeNames.map(normalizeExeName).filter((name) => name.endsWith('.exe'))
  const mode = options.mode ?? 'blocklist'
  const allowed = new Set(
    (options.allowedExeNames ?? [])
      .map(normalizeExeName)
      .filter((name) => name.endsWith('.exe') && !isSafeListed(name)),
  )
  const blockAll = rawForbidden.includes(SLEEP_LOCKDOWN_PROCESS_MARKER)
  const forbidden = new Set(
    rawForbidden.filter((name) => name !== SLEEP_LOCKDOWN_PROCESS_MARKER && !isSafeListed(name)),
  )

  if (mode !== 'allowlist' && !blockAll && forbidden.size === 0) return { stop: () => undefined }

  const notifiedProcesses = new Set<string>()

  function notifyAttempt(processName: string, pid: number): void {
    if (!onBlocked) return
    const key = `${processName.toLowerCase()}:${pid}`
    if (notifiedProcesses.has(key)) return
    notifiedProcesses.add(key)
    onBlocked({ processName, pid, blockAll })
  }

  // 1. Scan initial des processus déjà lancés.
  let scanInFlight = false
  const scan = async (): Promise<void> => {
    if (scanInFlight) return
    scanInFlight = true
    try {
      const processes = await listProcesses()
      const runningProcesses = new Set(
        processes.map((process) => `${process.name.toLowerCase()}:${process.pid}`),
      )
      for (const key of notifiedProcesses) {
        if (!runningProcesses.has(key)) notifiedProcesses.delete(key)
      }
      const decisions = await Promise.all(
        processes.map(async (process) => ({
          process,
          shouldNotify: await shouldCloseDetectedProcess({
            processName: process.name,
            pid: process.pid,
            mode,
            blockAll,
            forbidden,
            allowed,
            visibleWindowCheck: processHasVisibleWindow,
          }),
        })),
      )
      for (const { process, shouldNotify } of decisions) {
        if (shouldNotify) notifyAttempt(process.name, process.pid)
      }
    } catch (err) {
      log.error('[blocking] process scan failed', err)
    } finally {
      scanInFlight = false
    }
  }

  // Le moniteur WMI précédent démarrait trop lentement et pouvait manquer le
  // processus lancé juste après START_SESSION. Un scan court et non
  // chevauchant est déterministe et détecte aussi les processus déjà ouverts.
  void scan()
  const pollingInterval = setInterval(() => {
    void scan()
  }, intervalMs)

  return {
    stop: () => {
      clearInterval(pollingInterval)
    },
  }
}
