import { createBridgeServer, type BridgeServer } from './bridge/server'
import type { ServiceInfo } from '@shared/service-protocol'
import { createStorage } from './storage'
import { serviceDataDir } from './data-dir'
import { createBlockingAdapters } from './blocking-adapters'
import { createBlockingHost, createBlockingHandlers } from './blocking-host'
import log from './logging'

const SERVICE_VERSION = '0.12.0'
const startedAt = Date.now()

async function main(): Promise<void> {
  log.info('[service] starting', { pid: process.pid })

  // Le service possède ses fichiers de blocage dans C:\ProgramData\Nexus (spec §4.4).
  const storage = createStorage(serviceDataDir())
  const host = createBlockingHost(createBlockingAdapters(storage))

  const server: BridgeServer = await createBridgeServer({
    handlers: {
      PING: async () => 'pong',
      GET_SERVICE_INFO: async (): Promise<ServiceInfo> => ({
        version: SERVICE_VERSION,
        pid: process.pid,
        uptimeMs: Date.now() - startedAt,
      }),
      ...createBlockingHandlers(host),
    },
    onError: (err) => log.error('[service] bridge error', err),
  })

  // Câblé avant hydrate() : si l'hydratation ré-applique une session, son
  // événement SESSION_CHANGED est diffusé aux clients déjà connectés.
  host.on((event) => {
    server.broadcast({ type: event.type, payload: event.payload })
  })

  await host.hydrate()
  log.info('[service] bridge listening, blocking host ready')

  const shutdown = (signal: string): void => {
    log.info('[service] shutting down', { signal })
    host.stop()
    void server.close().then(() => process.exit(0))
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

main().catch((err) => {
  log.error('[service] fatal', err)
  process.exit(1)
})
