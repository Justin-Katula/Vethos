import { execFile as execFileCallback } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { app } from 'electron'
import { Service } from 'node-windows'
import { serviceDataDir } from '@service/data-dir'
import { migrateBlockingData } from './blocking/migrate-blocking-data'
import log from './logging/setup'

/** Nom du service Windows installé pour porter le blocage Nexus. */
export const SERVICE_NAME = 'NexusBlockingService'

const execFile = promisify(execFileCallback)
const WRAPPER_ID = SERVICE_NAME.replace(/[^\w]/gi, '').toLowerCase()
const WRAPPER_EXE = `${WRAPPER_ID}.exe`
const WAIT_FOR_DAEMON_MS = 10_000
const SERVICE_STATUS_RUNNING = 4

/**
 * Chemin du bundle du service (`out/service/index.js`). En production le bundle
 * est hors de l'asar (`asarUnpack`, posé au Lot 4b). En dev, à la racine du projet.
 */
function serviceScriptPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'app.asar.unpacked', 'out', 'service', 'index.js')
  }
  return join(app.getAppPath(), 'out', 'service', 'index.js')
}

/**
 * Construit l'objet `Service` node-windows. HYPOTHÈSE DU SPIKE : node-windows fait
 * tourner le service via un exécutable Node ; comme la routine d'install s'exécute
 * sous `Nexus.exe` (binaire Electron), et avec `ELECTRON_RUN_AS_NODE=1` dans
 * l'environnement du service, le binaire Electron exécute le bundle en mode Node.
 */
function buildService(): Service {
  return new Service({
    name: SERVICE_NAME,
    description: 'Service de blocage en arrière-plan de Nexus (sous-projet P16).',
    script: serviceScriptPath(),
    env: [{ name: 'ELECTRON_RUN_AS_NODE', value: '1' }],
    wait: 2,
    grow: 0.5,
    maxRestarts: 10,
  })
}

function daemonDir(): string {
  return join(dirname(serviceScriptPath()), 'daemon')
}

function daemonExecutablePath(): string {
  return join(daemonDir(), WRAPPER_EXE)
}

function daemonXmlPath(): string {
  return join(daemonDir(), `${WRAPPER_ID}.xml`)
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await fs.access(path)
    return true
  } catch {
    return false
  }
}

async function waitForPath(path: string): Promise<void> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < WAIT_FOR_DAEMON_MS) {
    if (await pathExists(path)) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Fichier daemon introuvable après génération node-windows: ${path}`)
}

async function normalizeServiceXml(): Promise<void> {
  const xmlPath = daemonXmlPath()
  const xml = await fs.readFile(xmlPath, 'utf8')
  const normalized = xml.replace(`<id>${WRAPPER_EXE}</id>`, `<id>${SERVICE_NAME}</id>`)
  if (normalized !== xml) {
    await fs.writeFile(xmlPath, normalized, 'utf8')
  }
}

async function serviceState(): Promise<number | null> {
  try {
    const { stdout } = await execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `$service = Get-Service -Name '${SERVICE_NAME}' -ErrorAction SilentlyContinue; if ($null -eq $service) { exit 2 }; [int]$service.Status`,
      ],
      { windowsHide: true },
    )
    const state = Number(stdout.trim())
    return Number.isFinite(state) ? state : null
  } catch {
    return null
  }
}

async function runDaemon(command: 'install' | 'start' | 'stop' | 'uninstall'): Promise<void> {
  await execFile(daemonExecutablePath(), [command], { windowsHide: true })
}

async function ensureServiceInstalledAndStarted(): Promise<void> {
  await waitForPath(daemonExecutablePath())
  await waitForPath(daemonXmlPath())
  await normalizeServiceXml()

  if ((await serviceState()) === null) {
    await runDaemon('install')
  }

  const state = await serviceState()
  if (state !== SERVICE_STATUS_RUNNING) {
    await runDaemon('start').catch(async (err) => {
      if ((await serviceState()) !== SERVICE_STATUS_RUNNING) throw err
    })
  }
}

/**
 * Installe `NexusBlockingService` et le démarre. Idempotent : si le service est
 * déjà installé, résout sans erreur. À appeler depuis une routine élevée
 * (l'install d'un service Windows exige les droits admin).
 */
export async function installService(): Promise<void> {
  await migrateBlockingData(app.getPath('userData'), serviceDataDir())

  return new Promise<void>((resolve, reject) => {
    const svc = buildService()
    let settled = false
    const finishInstall = (source: 'install' | 'alreadyinstalled'): void => {
      if (settled) return
      settled = true
      ensureServiceInstalledAndStarted()
        .then(() => {
          log.info('[service-install] service installé et démarré', { source })
          resolve()
        })
        .catch(reject)
    }
    svc.on('install', () => finishInstall('install'))
    svc.on('alreadyinstalled', () => finishInstall('alreadyinstalled'))
    svc.on('invalidinstallation', () => {
      reject(new Error('Installation du service invalide'))
    })
    svc.on('error', (err) => {
      if (!settled) reject(err)
    })
    svc.install()
  })
}

/** Désinstalle `NexusBlockingService`. Idempotent côté node-windows. */
export async function uninstallService(): Promise<void> {
  const wrapperExists = await pathExists(daemonExecutablePath())
  if ((await serviceState()) !== null) {
    if (wrapperExists) {
      await runDaemon('stop').catch(() => undefined)
      await runDaemon('uninstall').catch(async (err) => {
        if ((await serviceState()) !== null) throw err
      })
    } else {
      await execFile('sc.exe', ['stop', SERVICE_NAME], { windowsHide: true }).catch(() => undefined)
      await execFile('sc.exe', ['delete', SERVICE_NAME], { windowsHide: true })
    }
  }
  await fs.rm(daemonDir(), { recursive: true, force: true }).catch(() => undefined)
  log.info('[service-install] service désinstallé')
}
