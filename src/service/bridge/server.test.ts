import { describe, it, expect, afterEach } from 'vitest'
import net from 'node:net'
import { createBridgeServer, type BridgeServer } from './server'
import { encodeMessage, createMessageDecoder, type ServiceMessage } from '@shared/service-protocol'

const testPipe = (): string => `\\\\.\\pipe\\nexus-test-${process.pid}-${Math.random().toString(36).slice(2)}`

let server: BridgeServer | null = null
afterEach(async () => {
  await server?.close()
  server = null
})

function collect(socket: net.Socket): { next: () => Promise<ServiceMessage> } {
  const decode = createMessageDecoder()
  const queue: ServiceMessage[] = []
  const waiters: Array<(m: ServiceMessage) => void> = []
  socket.setEncoding('utf8')
  socket.on('data', (chunk: string) => {
    for (const m of decode(chunk)) {
      const w = waiters.shift()
      if (w) w(m)
      else queue.push(m)
    }
  })
  return {
    next: () =>
      new Promise<ServiceMessage>((resolve) => {
        const m = queue.shift()
        if (m) resolve(m)
        else waiters.push(resolve)
      }),
  }
}

describe('createBridgeServer', () => {
  it('route une requête vers son handler et répond avec le même id', async () => {
    const pipe = testPipe()
    server = await createBridgeServer({
      pipePath: pipe,
      handlers: { PING: async () => 'pong' },
    })
    const client = net.createConnection(pipe)
    const inbox = collect(client)
    client.write(encodeMessage({ kind: 'request', id: 'r1', type: 'PING' }))
    const res = await inbox.next()
    expect(res).toEqual({ kind: 'response', id: 'r1', ok: true, data: 'pong' })
    client.destroy()
  })

  it('répond ok:false pour un type de requête inconnu', async () => {
    const pipe = testPipe()
    server = await createBridgeServer({ pipePath: pipe, handlers: {} })
    const client = net.createConnection(pipe)
    const inbox = collect(client)
    client.write(encodeMessage({ kind: 'request', id: 'r2', type: 'NOPE' }))
    const res = await inbox.next()
    expect(res).toMatchObject({ kind: 'response', id: 'r2', ok: false })
    client.destroy()
  })

  it('broadcast pousse un événement aux clients connectés', async () => {
    const pipe = testPipe()
    server = await createBridgeServer({ pipePath: pipe, handlers: {} })
    const client = net.createConnection(pipe)
    const inbox = collect(client)
    await new Promise((r) => client.once('connect', r))
    server.broadcast({ type: 'SESSION_CHANGED', payload: { foo: 1 } })
    const evt = await inbox.next()
    expect(evt).toEqual({ kind: 'event', type: 'SESSION_CHANGED', payload: { foo: 1 } })
    client.destroy()
  })
})
