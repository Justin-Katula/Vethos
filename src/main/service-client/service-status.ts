import { execFile as execFileCallback } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import net from 'node:net'
import { promisify } from 'node:util'
import {
  PIPE_PATH,
  createMessageDecoder,
  encodeMessage,
  type ServiceInfo,
} from '@shared/service-protocol'

export type ServiceStatus = 'ok' | 'unavailable'

const execFile = promisify(execFileCallback)
const VETHOS_BLOCKING_SERVICE_NAME = 'VethosBlockingService'
const SERVICE_NAMES = ['vethosblockingservice.exe', VETHOS_BLOCKING_SERVICE_NAME]
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
  const isDefaultPipe = pipePath === PIPE_PATH
  const [pipeAvailable, serviceStates] = await Promise.all([
    probeServicePipe(pipePath),
    isDefaultPipe
      ? Promise.all(SERVICE_NAMES.map((name) => getWindowsServiceState(name)))
      : Promise.resolve([]),
  ])

  if (!pipeAvailable) return 'unavailable'
  const knownStates = serviceStates.filter((state): state is number => state !== null)
  if (knownStates.length > 0 && !knownStates.includes(SERVICE_STATUS_RUNNING)) return 'unavailable'
  return 'ok'
}

/** Lit la version du moteur réellement chargé, pas seulement celle sur disque. */
export function getBlockingServiceInfo(pipePath = PIPE_PATH): Promise<ServiceInfo | null> {
  return new Promise((resolve) => {
    const socket = net.createConnection(pipePath)
    const requestId = randomUUID()
    const decode = createMessageDecoder()
    let settled = false

    const finish = (info: ServiceInfo | null): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.destroy()
      resolve(info)
    }

    const timer = setTimeout(() => finish(null), PROBE_TIMEOUT_MS)
    socket.setEncoding('utf8')
    socket.once('connect', () => {
      socket.write(encodeMessage({ kind: 'request', id: requestId, type: 'GET_SERVICE_INFO' }))
    })
    socket.on('data', (chunk: string) => {
      try {
        for (const message of decode(chunk)) {
          if (message.kind !== 'response' || message.id !== requestId || !message.ok) continue
          const info = message.data as Partial<ServiceInfo> | undefined
          if (
            typeof info?.version === 'string' &&
            typeof info.pid === 'number' &&
            typeof info.uptimeMs === 'number'
          ) {
            finish(info as ServiceInfo)
          }
        }
      } catch {
        finish(null)
      }
    })
    socket.once('error', () => finish(null))
    socket.once('close', () => finish(null))
  })
}

export async function isVethosBlockingServiceDetected(): Promise<boolean> {
  if (process.platform !== 'win32') return false
  return (await getWindowsServiceState(VETHOS_BLOCKING_SERVICE_NAME)) !== null
}
