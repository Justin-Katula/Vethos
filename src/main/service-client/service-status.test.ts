import { afterEach, describe, expect, it } from 'vitest'
import { createBridgeServer, type BridgeServer } from '@service/bridge/server'
import type { ServiceInfo } from '@shared/service-protocol'
import { getBlockingServiceInfo, getServiceStatus } from './service-status'

const testPipe = (): string =>
  `\\\\.\\pipe\\vethos-status-test-${process.pid}-${Math.random().toString(36).slice(2)}`

let server: BridgeServer | null = null

afterEach(async () => {
  await server?.close()
  server = null
})

describe('getBlockingServiceInfo', () => {
  it('lit la version du moteur réellement connecté', async () => {
    const pipePath = testPipe()
    const info: ServiceInfo = { version: '9.8.7', pid: 4321, uptimeMs: 12_345 }
    server = await createBridgeServer({
      pipePath,
      handlers: { GET_SERVICE_INFO: async () => info },
    })

    await expect(getBlockingServiceInfo(pipePath)).resolves.toEqual(info)
  })

  it('renvoie null quand la réponse ne respecte pas le protocole', async () => {
    const pipePath = testPipe()
    server = await createBridgeServer({
      pipePath,
      handlers: { GET_SERVICE_INFO: async () => ({ version: '9.8.7' }) },
    })

    await expect(getBlockingServiceInfo(pipePath)).resolves.toBeNull()
  })
})

describe('getServiceStatus', () => {
  it('renvoie ok si le pipe est dispo pour un pipe custom', async () => {
    const pipePath = testPipe()
    server = await createBridgeServer({
      pipePath,
      handlers: {},
    })

    await expect(getServiceStatus(pipePath)).resolves.toBe('ok')
  })
})
