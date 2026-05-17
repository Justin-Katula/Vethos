import { spawn } from 'node:child_process'
import net from 'node:net'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { PIPE_PATH } from '@shared/service-protocol'
import { serviceDataDir } from '@service/data-dir'
import { migrateBlockingData } from './blocking/migrate-blocking-data'
import log from './logging/setup'

const PROBE_TIMEOUT_MS = 1000

/**
 * Teste en une seule tentative brève si un service répond déjà sur le named
 * pipe. Aucune reconnexion : connexion ouverte → service présent ; erreur
 * (pipe inexistant) ou timeout → absent.
 */
function probeService(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection(PIPE_PATH)
    let settled = false
    const finish = (running: boolean): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.destroy()
      resolve(running)
    }
    const timer = setTimeout(() => finish(false), PROBE_TIMEOUT_MS)
    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
  })
}

/**
 * Chemin du bundle du service. En dev : `out/service/index.js` à la racine du
 * projet (produit par `npm run build:service`). En production : le bundle est
 * sorti de l'asar par `asarUnpack` (cf. electron-builder.yml) — un script dans
 * l'asar ne serait pas exécutable en mode Node pur.
 */
function resolveServiceEntry(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'app.asar.unpacked', 'out', 'service', 'index.js')
  }
  return join(app.getAppPath(), 'out', 'service', 'index.js')
}

/**
 * Lance le service en process détaché : il survit à la fermeture / au kill de
 * l'UI. Tourne sur le binaire Electron en mode Node (`ELECTRON_RUN_AS_NODE`).
 */
function spawnDetachedService(entry: string): void {
  const child = spawn(process.execPath, [entry], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  })
  child.unref()
}

/**
 * S'assure qu'un service de blocage tourne. Si aucun service ne répond sur le
 * pipe : migre les fichiers de blocage vers `C:\ProgramData\Nexus`, puis lance
 * le service en process détaché. Ne lève jamais — un échec est journalisé et
 * l'app continue (le relais du Lot 4a remontera alors des erreurs honnêtes).
 */
export async function ensureServiceRunning(): Promise<void> {
  if (await probeService()) {
    log.info('[service-launcher] service déjà en cours')
    return
  }
  const entry = resolveServiceEntry()
  if (!existsSync(entry)) {
    log.warn('[service-launcher] bundle service introuvable — lancement ignoré', entry)
    return
  }
  try {
    await migrateBlockingData(app.getPath('userData'), serviceDataDir())
    spawnDetachedService(entry)
    log.info('[service-launcher] service lancé en process détaché', entry)
  } catch (err) {
    log.error('[service-launcher] échec du lancement du service', err)
  }
}
