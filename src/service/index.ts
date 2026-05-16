import { createBridgeServer, type BridgeServer } from './bridge/server'
import type { ServiceInfo } from '@shared/service-protocol'
import log from './logging'

const SERVICE_VERSION = '0.12.0'
const startedAt = Date.now()

async function main(): Promise<void> {
  log.info('[service] starting', { pid: process.pid })

  const server: BridgeServer = await createBridgeServer({
    handlers: {
      PING: async () => 'pong',
      GET_SERVICE_INFO: async (): Promise<ServiceInfo> => ({
        version: SERVICE_VERSION,
        pid: process.pid,
        uptimeMs: Date.now() - startedAt,
      }),
    },
    onError: (err) => log.error('[service] bridge error', err),
  })

  log.info('[service] bridge listening')

  const shutdown = (signal: string): void => {
    log.info('[service] shutting down', { signal })
    void server.close().then(() => process.exit(0))
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

main().catch((err) => {
  log.error('[service] fatal', err)
  process.exit(1)
})
