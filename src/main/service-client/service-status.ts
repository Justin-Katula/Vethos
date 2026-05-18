import { execFile as execFileCallback } from 'node:child_process'
import net from 'node:net'
import { promisify } from 'node:util'
import { PIPE_PATH } from '@shared/service-protocol'

export type ServiceStatus = 'ok' | 'unavailable'

const execFile = promisify(execFileCallback)
const SERVICE_NAME = 'NexusBlockingService'
const SERVICE_STATUS_RUNNING = 4
const PROBE_TIMEOUT_MS = 1000

function probeServicePipe(pipePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection(pipePath)
    let settled = false

    const finish = (available: boolean): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.destroy()
      resolve(available)
    }

    const timer = setTimeout(() => finish(false), PROBE_TIMEOUT_MS)
    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
  })
}

async function getWindowsServiceState(): Promise<number | null> {
  if (process.platform !== 'win32') return null

  try {
    const { stdout } = await execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `$service = Get-Service -Name '${SERVICE_NAME}' -ErrorAction SilentlyContinue; if ($null -eq $service) { exit 2 }; [int]$service.Status`,
      ],
      { windowsHide: true },
    )
    const state = Number(stdout.trim())
    return Number.isFinite(state) ? state : null
  } catch {
    return null
  }
}

export async function getServiceStatus(pipePath = PIPE_PATH): Promise<ServiceStatus> {
  const [pipeAvailable, serviceState] = await Promise.all([
    probeServicePipe(pipePath),
    getWindowsServiceState(),
  ])

  if (!pipeAvailable) return 'unavailable'
  if (serviceState !== null && serviceState !== SERVICE_STATUS_RUNNING) return 'unavailable'
  return 'ok'
}
