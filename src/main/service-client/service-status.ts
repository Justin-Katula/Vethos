import { execFile as execFileCallback } from 'node:child_process'
import net from 'node:net'
import { promisify } from 'node:util'
import { PIPE_PATH } from '@shared/service-protocol'

export type ServiceStatus = 'ok' | 'unavailable'

const execFile = promisify(execFileCallback)
const SERVICE_NAMES = ['nexusblockingservice.exe', 'NexusBlockingService']
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

async function getWindowsServiceState(serviceName: string): Promise<number | null> {
  if (process.platform !== 'win32') return null

  try {
    const { stdout } = await execFile('sc.exe', ['query', serviceName], { windowsHide: true })
    const match = /STATE\s*:\s*(\d+)/.exec(stdout)
    const state = Number(match?.[1])
    return Number.isFinite(state) ? state : null
  } catch {
    return null
  }
}

export async function getServiceStatus(pipePath = PIPE_PATH): Promise<ServiceStatus> {
  const [pipeAvailable, serviceStates] = await Promise.all([
    probeServicePipe(pipePath),
    Promise.all(SERVICE_NAMES.map((name) => getWindowsServiceState(name))),
  ])

  if (!pipeAvailable) return 'unavailable'
  const knownStates = serviceStates.filter((state): state is number => state !== null)
  if (knownStates.length > 0 && !knownStates.includes(SERVICE_STATUS_RUNNING)) return 'unavailable'
  return 'ok'
}
