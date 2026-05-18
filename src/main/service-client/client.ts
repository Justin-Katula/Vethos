import net from 'node:net'
import { randomUUID } from 'node:crypto'
import {
  PIPE_PATH,
  encodeMessage,
  createMessageDecoder,
  type ServiceEvent,
} from '@shared/service-protocol'

export type ServiceClient = {
  /** Envoie une requête ; résout avec `data`, rejette sur erreur/timeout. */
  request: (type: string, payload?: unknown) => Promise<unknown>
  /** Abonne un callback aux événements poussés par le service. */
  onEvent: (cb: (event: ServiceEvent) => void) => void
  isConnected: () => boolean
  close: () => void
}

const REQUEST_TIMEOUT_MS = 5000
const INITIAL_RECONNECT_DELAY_MS = 500
const MAX_RECONNECT_DELAY_MS = 10_000

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }

export function createServiceClient(opts?: {
  pipePath?: string
  onStatusChange?: (connected: boolean) => void
}): ServiceClient {
  const pipePath = opts?.pipePath ?? PIPE_PATH
  const pending = new Map<string, Pending>()
  const eventListeners: Array<(e: ServiceEvent) => void> = []
  let socket: net.Socket | null = null
  let connected = false
  let reconnectDelay = INITIAL_RECONNECT_DELAY_MS
  let reconnectTimer: NodeJS.Timeout | null = null
  let reportedConnected: boolean | null = null
  let closed = false

  function reportStatus(nextConnected: boolean): void {
    if (reportedConnected === nextConnected) return
    reportedConnected = nextConnected
    opts?.onStatusChange?.(nextConnected)
  }

  function rejectPending(reason: string): void {
    for (const p of pending.values()) {
      clearTimeout(p.timer)
      p.reject(new Error(reason))
    }
    pending.clear()
  }

  function scheduleReconnect(): void {
    if (closed || reconnectTimer) return
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connect()
    }, reconnectDelay)
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY_MS)
  }

  function connect(): void {
    if (closed) return
    const decode = createMessageDecoder()
    const s = net.createConnection(pipePath)
    s.setEncoding('utf8')

    s.on('connect', () => {
      socket = s
      connected = true
      reconnectDelay = INITIAL_RECONNECT_DELAY_MS
      reportStatus(true)
    })

    s.on('data', (chunk: string) => {
      let messages
      try {
        messages = decode(chunk)
      } catch {
        return
      }
      for (const msg of messages) {
        if (msg.kind === 'response') {
          const p = pending.get(msg.id)
          if (!p) continue
          clearTimeout(p.timer)
          pending.delete(msg.id)
          if (msg.ok) p.resolve(msg.data)
          else p.reject(new Error(msg.error))
        } else if (msg.kind === 'event') {
          for (const cb of eventListeners) cb(msg)
        }
      }
    })

    // 'error' précède 'close' ; on laisse 'close' gérer la reconnexion.
    s.on('error', () => undefined)
    s.on('close', () => {
      if (socket === s) {
        socket = null
        connected = false
        rejectPending('Service disconnected')
        reportStatus(false)
      } else if (!connected) {
        reportStatus(false)
      }
      scheduleReconnect()
    })
  }

  connect()

  return {
    request(type, payload) {
      return new Promise<unknown>((resolve, reject) => {
        if (!socket || !connected) {
          reject(new Error('Service not connected'))
          return
        }
        const id = randomUUID()
        const timer = setTimeout(() => {
          pending.delete(id)
          reject(new Error(`Service request timed out: ${type}`))
        }, REQUEST_TIMEOUT_MS)
        pending.set(id, { resolve, reject, timer })
        socket.write(encodeMessage({ kind: 'request', id, type, payload }))
      })
    },
    onEvent(cb) {
      eventListeners.push(cb)
    },
    isConnected: () => connected,
    close() {
      closed = true
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      rejectPending('Service client closed')
      socket?.destroy()
    },
  }
}
