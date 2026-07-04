import { execFile as execFileCallback } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { dirname, join, normalize } from 'node:path'
import { promisify } from 'node:util'
import { app } from 'electron'
import { serviceDataDir } from '@service/data-dir'
import { migrateBlockingData } from './blocking/migrate-blocking-data'
import log from './logging/setup'

/** Nom du service Windows installé pour porter le blocage Vethos. */
export const SERVICE_NAME = 'VethosBlockingService'

const execFile = promisify(execFileCallback)
const WRAPPER_ID = SERVICE_NAME.replace(/[^\w]/gi, '').toLowerCase() // "vethosblockingservice"
const WRAPPER_EXE = `${WRAPPER_ID}.exe` // "vethosblockingservice.exe"
const WINDOWS_SERVICE_NAME = SERVICE_NAME // "VethosBlockingService"
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
 * Chemin de l'exécutable WinSW d'origine dans le dossier des ressources.
 */
function winswExecutablePath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'WinSW-x64.exe')
  }
  return join(app.getAppPath(), 'resources', 'WinSW-x64.exe')
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

/**
 * Génère dynamiquement le fichier XML requis par WinSW 3.x et copie le binaire.
 */
async function prepareDaemonFiles(): Promise<void> {
  const dir = daemonDir()
  await fs.mkdir(dir, { recursive: true })

  const sourceExe = winswExecutablePath()
  const targetExe = daemonExecutablePath()
  const targetXml = daemonXmlPath()

  log.info('[service-install] preparing daemon files', { sourceExe, targetExe, targetXml })

  // Copie de WinSW executable
  // Le wrapper WinSW peut être verrouillé par le service actuellement lancé.
  // Il est générique et n'a pas besoin d'être recopié à chaque mise à jour.
  if (!(await pathExists(targetExe))) {
    await fs.copyFile(sourceExe, targetExe)
  }

  // Écriture du fichier de configuration XML requis par WinSW 3.x
  const xmlContent = `<service>
  <id>${SERVICE_NAME}</id>
  <name>Vethos Blocking Service</name>
  <description>Moteur de blocage anti-distraction pour l'application Vethos.</description>
  <startmode>Automatic</startmode>
  <executable>${process.execPath}</executable>
  <arguments>${serviceScriptPath()}</arguments>
  <env name="ELECTRON_RUN_AS_NODE" value="1"/>
  <log mode="roll-by-size">
    <sizeThreshold>10240</sizeThreshold>
    <keepFiles>8</keepFiles>
  </log>
</service>`

  await fs.writeFile(targetXml, xmlContent, 'utf8')
}

async function serviceState(serviceName = WINDOWS_SERVICE_NAME): Promise<number | null> {
  try {
    const { stdout } = await execFile('sc.exe', ['query', serviceName], { windowsHide: true })
    const match = /STATE\s*:\s*(\d+)/.exec(stdout)
    const state = Number(match?.[1])
    return Number.isFinite(state) ? state : null
  } catch {
    return null
  }
}

async function installedServiceBinaryPath(serviceName = WINDOWS_SERVICE_NAME): Promise<string | null> {
  try {
    const { stdout } = await execFile('sc.exe', ['qc', serviceName], { windowsHide: true })
    const line = stdout
      .split(/\r?\n/)
      .find((entry) => entry.trimStart().startsWith('BINARY_PATH_NAME'))
    const raw = line?.split(':').slice(1).join(':').trim()
    if (!raw) return null
    const quoted = /^"([^"]+)"/.exec(raw)
    return quoted?.[1] ?? raw.split(/\s+/)[0] ?? null
  } catch {
    return null
  }
}

function samePath(a: string, b: string): boolean {
  return normalize(a).toLowerCase() === normalize(b).toLowerCase()
}

async function waitForServiceDeleted(serviceName = WINDOWS_SERVICE_NAME): Promise<void> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < WAIT_FOR_DAEMON_MS) {
    if ((await serviceState(serviceName)) === null) return
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Service ${serviceName} encore présent après suppression`)
}

async function uninstallServiceViaSc(serviceName = WINDOWS_SERVICE_NAME): Promise<void> {
  await execFile('sc.exe', ['stop', serviceName], { windowsHide: true }).catch(() => undefined)
  await execFile('sc.exe', ['delete', serviceName], { windowsHide: true })
  await waitForServiceDeleted(serviceName)
}

async function uninstallStaleServiceIfNeeded(): Promise<void> {
  // Nettoyer l'ancienne installation node-windows qui utilisait "vethosblockingservice.exe" comme ID de service
  const oldServiceName = 'vethosblockingservice.exe'
  if ((await serviceState(oldServiceName)) !== null) {
    log.info(`[service-install] ancienne installation node-windows détectée, suppression de ${oldServiceName}`)
    await uninstallServiceViaSc(oldServiceName)
  }

  // Nettoyer l'ancienne installation si elle pointe vers un autre chemin d'exécutable
  if ((await serviceState(SERVICE_NAME)) === null) return
  const installedPath = await installedServiceBinaryPath(SERVICE_NAME)
  const expectedPath = daemonExecutablePath()
  if (installedPath && samePath(installedPath, expectedPath)) return

  log.info('[service-install] service VethosBlockingService existant obsolète, remplacement', {
    installedPath,
    expectedPath,
  })
  await uninstallServiceViaSc(SERVICE_NAME)
}

async function runDaemon(command: 'install' | 'start' | 'stop' | 'uninstall'): Promise<void> {
  await execFile(daemonExecutablePath(), [command], { windowsHide: true })
}

async function ensureServiceInstalledAndStarted(options: { restartIfRunning?: boolean } = {}): Promise<void> {
  if ((await serviceState()) === null) {
    await runDaemon('install')
  }

  let state = await serviceState()
  if (state === SERVICE_STATUS_RUNNING && options.restartIfRunning) {
    await runDaemon('stop').catch(() => undefined)
    state = await serviceState()
  }
  if (state !== SERVICE_STATUS_RUNNING) {
    await runDaemon('start').catch(async (err) => {
      if ((await serviceState()) !== SERVICE_STATUS_RUNNING) throw err
    })
  }
}

/**
 * Installe `VethosBlockingService` et le démarre. Idempotent : si le service est
 * déjà installé, résout sans erreur. À appeler depuis une routine élevée
 * (l'install d'un service Windows exige les droits admin).
 */
export async function installService(): Promise<void> {
  await migrateBlockingData(app.getPath('userData'), serviceDataDir())
  await uninstallStaleServiceIfNeeded()

  // 1. Copier le binaire WinSW et générer dynamiquement le XML
  await prepareDaemonFiles()

  // 2. Installer et démarrer
  const isInstalled = (await serviceState()) !== null
  const source = isInstalled ? 'alreadyinstalled' : 'install'

  await ensureServiceInstalledAndStarted({ restartIfRunning: isInstalled })
  log.info('[service-install] service installé et démarré', { source })
}

/** Désinstalle `VethosBlockingService`. Idempotent. */
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
