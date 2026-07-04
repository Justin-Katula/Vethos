import { describe, it, expect, afterEach } from 'vitest'
import { createBridgeServer, type BridgeServer } from '@service/bridge/server'
import { createServiceClient, type ServiceClient } from './client'

const testPipe = (): string =>
  `\\\\.\\pipe\\vethos-test-${process.pid}-${Math.random().toString(36).slice(2)}`
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

let server: BridgeServer | null = null
let client: ServiceClient | null = null
afterEach(async () => {
  client?.close()
  client = null
  await server?.close()
  server = null
})

describe('createServiceClient', () => {
  it('envoie une requête et résout avec la réponse corrélée', async () => {
    const pipe = testPipe()
    server = await createBridgeServer({ pipePath: pipe, handlers: { PING: async () => 'pong' } })
    const statuses: boolean[] = []
    client = createServiceClient({ pipePath: pipe, onStatusChange: (s) => statuses.push(s) })
    await wait(100)
    expect(client.isConnected()).toBe(true)
    expect(statuses).toEqual([true])
    await expect(client.request('PING')).resolves.toBe('pong')
  })

  it('rejette quand le handler renvoie une erreur', async () => {
    const pipe = testPipe()
    server = await createBridgeServer({
      pipePath: pipe,
      handlers: {
        BOOM: async () => {
          throw new Error('nope')
        },
      },
    })
    client = createServiceClient({ pipePath: pipe })
    await wait(100)
    await expect(client.request('BOOM')).rejects.toThrow('nope')
  })

  it('délivre les événements broadcastés', async () => {
    const pipe = testPipe()
    server = await createBridgeServer({ pipePath: pipe, handlers: {} })
    client = createServiceClient({ pipePath: pipe })
    await wait(100)
    const received: unknown[] = []
    client.onEvent((e) => received.push(e))
    server.broadcast({ type: 'CLOCK_TAMPER', payload: { driftMs: 9000 } })
    await wait(100)
    expect(received).toEqual([{ kind: 'event', type: 'CLOCK_TAMPER', payload: { driftMs: 9000 } }])
  })

  it('rejette une requête quand le service est injoignable', async () => {
    const statuses: boolean[] = []
    client = createServiceClient({
      pipePath: testPipe(),
      onStatusChange: (s) => statuses.push(s),
    })
    await wait(100)
    expect(client.isConnected()).toBe(false)
    expect(statuses).toEqual([false])
    await expect(client.request('PING')).rejects.toThrow('not connected')
  })
})
