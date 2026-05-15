import net from 'node:net'
import {
  PIPE_PATH,
  encodeMessage,
  createMessageDecoder,
  type ServiceRequest,
  type ServiceResponse,
  type ServiceEvent,
} from '@shared/service-protocol'

export type RequestHandler = (req: ServiceRequest) => Promise<unknown>

export type BridgeServer = {
  /** Pousse un événement à tous les clients connectés. */
  broadcast: (event: Omit<ServiceEvent, 'kind'>) => void
  /** Ferme le serveur et toutes les connexions. */
  close: () => Promise<void>
}

export function createBridgeServer(opts: {
  pipePath?: string
  handlers: Record<string, RequestHandler>
  onError?: (err: Error) => void
}): Promise<BridgeServer> {
  const pipePath = opts.pipePath ?? PIPE_PATH
  const sockets = new Set<net.Socket>()

  async function handleRequest(req: ServiceRequest, socket: net.Socket): Promise<void> {
    const handler = opts.handlers[req.type]
    let res: ServiceResponse
    if (!handler) {
      res = { kind: 'response', id: req.id, ok: false, error: `Unknown request type: ${req.type}` }
    } else {
      try {
        res = { kind: 'response', id: req.id, ok: true, data: await handler(req) }
      } catch (err) {
        res = { kind: 'response', id: req.id, ok: false, error: (err as Error).message }
      }
    }
    if (!socket.destroyed) socket.write(encodeMessage(res))
  }

  const server = net.createServer((socket) => {
    sockets.add(socket)
    socket.setEncoding('utf8')
    const decode = createMessageDecoder()
    socket.on('data', (chunk: string) => {
      let messages
      try {
        messages = decode(chunk)
      } catch (err) {
        opts.onError?.(err as Error)
        return
      }
      for (const msg of messages) {
        if (msg.kind === 'request') void handleRequest(msg, socket)
      }
    })
    socket.on('error', (err) => opts.onError?.(err))
    socket.on('close', () => sockets.delete(socket))
  })

  return new Promise<BridgeServer>((resolve, reject) => {
    server.once('error', reject)
    server.listen(pipePath, () => {
      server.removeListener('error', reject)
      resolve({
        broadcast(event) {
          const line = encodeMessage({ kind: 'event', ...event })
          // On Windows, the server connection callback may not have fired yet
          // when broadcast is called immediately after client connect.
          // We defer to the next poll+check cycle so the connection callback
          // can register the socket first.
          setTimeout(() => {
            for (const s of sockets) if (!s.destroyed) s.write(line)
          }, 0)
        },
        close() {
          return new Promise<void>((res) => {
            for (const s of sockets) s.destroy()
            server.close(() => res())
          })
        },
      })
    })
  })
}
