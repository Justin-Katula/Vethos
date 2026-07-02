import { join } from 'node:path'
import log from 'electron-log/node'
import { serviceDataDir } from './data-dir'

// electron-log en mode Node : l'API `app` d'Electron est indisponible sous
// ELECTRON_RUN_AS_NODE. Approche validée par le spike (Tâche 2).
log.transports.file.resolvePathFn = () =>
  join(serviceDataDir(), 'logs', 'vethos-service.log')
log.transports.file.maxSize = 10 * 1024 * 1024

export default log
