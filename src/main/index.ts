import log, { setupLogging } from './logging/setup'
import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { existsSync, rmSync, writeFileSync } from 'node:fs'
import { createStorage } from '@service/storage'
import { registerAllIpcHandlers } from './ipc'
import { focusWindow, notifyCrashRecovered } from './notifications'
import { startUpdater } from './updater/setup'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import { installService, uninstallService } from './service-install'
import { requestServiceInstall } from './elevated-install'
import {
  getBlockingServiceInfo,
  getServiceStatus,
  isVethosBlockingServiceDetected,
} from './service-client/service-status'
import { BLOCKING_SERVICE_VERSION } from '@shared/service-protocol'
import {
  prewarmProcessWindowProbe,
  stopProcessWindowProbe,
} from './tracking/process-window-probe'

// Init logging avant toute autre logique main (cf. setup.ts pour le pourquoi
// du module paresseux).
setupLogging()

// P16 Phase 3 — Lot 1 : si l'app est lancée avec un flag d'install/désinstall
// du service Windows, on exécute la routine correspondante au lieu d'ouvrir
// l'UI, puis on quitte. Détecté AVANT le verrou d'instance unique et whenReady.
const wantsInstallService = process.argv.includes('--install-service')
const wantsUninstallService = process.argv.includes('--uninstall-service')
const isBackgroundLaunch = process.argv.includes('--background')
if (wantsInstallService || wantsUninstallService) {
  const routine = wantsInstallService ? installService : uninstallService
  routine()
    .then(() => {
      log.info('[main] routine service-install terminée', {
        action: wantsInstallService ? 'install' : 'uninstall',
      })
      app.exit(0)
    })
    .catch((err) => {
      log.error('[main] routine service-install échouée', err)
      app.exit(1)
    })
} else {
  startVethosApp()
}

const isDev = !app.isPackaged

if (process.platform === 'win32') {
  app.setAppUserModelId('com.vethos.blocking')
}

if (isDev) {
  process.env.VETHOS_DEV = 'true'
  app.setName('Vethos Dev')
  app.setPath('userData', join(app.getPath('appData'), 'Vethos Dev'))
}

function crashMarkerPath(): string {
  return join(app.getPath('userData'), 'vethos-main-alive.marker')
}

function writeCrashMarker(): void {
  try {
    writeFileSync(crashMarkerPath(), new Date().toISOString(), 'utf8')
  } catch (err) {
    log.warn('unable to write crash marker', err)
  }
}

function clearCrashMarker(): void {
  try {
    rmSync(crashMarkerPath(), { force: true })
  } catch (err) {
    log.warn('unable to clear crash marker', err)
  }
}

function handleFatalProcessError(label: string, err: unknown): void {
  log.error(label, err)
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.APP_FLUSH_DEBOUNCES)
  }
  app.exit(1)
}

async function ensureBlockingServiceAtBoot(): Promise<void> {
  if (process.platform !== 'win32' || isDev) return

  try {
    const expectedVersion = BLOCKING_SERVICE_VERSION
    const [serviceDetected, serviceStatus, serviceInfo] = await Promise.all([
      isVethosBlockingServiceDetected(),
      getServiceStatus(),
      getBlockingServiceInfo(),
    ])

    if (
      serviceDetected &&
      serviceStatus === 'ok' &&
      serviceInfo?.version === expectedVersion
    ) {
      return
    }

    log.warn('[main] service VethosBlockingService absent ou obsolète, remplacement', {
      serviceDetected,
      serviceStatus,
      runningVersion: serviceInfo?.version,
      expectedVersion,
    })

    const launched = await requestServiceInstall()
    if (!launched) throw new Error('Installation élevée du service refusée ou échouée')

    const nextStatus = await getServiceStatus()
    log.info('[main] auto-install du service VethosBlockingService terminée', {
      serviceStatus: nextStatus,
    })
  } catch (err) {
    log.error('[main] auto-install du service VethosBlockingService échouée', err)
  }
}

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0a0a0c', // évite le flash blanc au démarrage
    show: false, // affichée seulement après ready-to-show
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    icon: join(__dirname, '../../build/icon.png'),
    titleBarOverlay: {
      color: '#0a0a0c',
      symbolColor: '#a1a1aa',
      height: 36,
    },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  win.once('ready-to-show', () => {
    win.show()
  })

  // Liens externes : ouvrir dans le navigateur, pas dans Electron
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

let mainWindow: BrowserWindow | null = null
let quitAfterDebounceFlush = false
let isBlockingSessionActive: () => boolean = () => false

function ensureMainWindow(): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) {
    focusWindow(mainWindow)
    return mainWindow
  }
  const win = createMainWindow()
  mainWindow = win
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })
  return win
}

function startVethosApp(): void {
  app
    .whenReady()
    .then(async () => {
      if (!isDev) {
        app.setLoginItemSettings({
          openAtLogin: true,
          path: process.execPath,
          args: ['--background'],
        })
      }
      const recoveredFromCrash = existsSync(crashMarkerPath())
      writeCrashMarker()
      prewarmProcessWindowProbe()
      void ensureBlockingServiceAtBoot()

      const storage = createStorage(app.getPath('userData'))
      const runtime = await registerAllIpcHandlers(storage, () => mainWindow, {
        isDevelopment: isDev,
      })
      isBlockingSessionActive = runtime.isSessionActive

      if (!isBackgroundLaunch) ensureMainWindow()

      if (recoveredFromCrash) notifyCrashRecovered(() => mainWindow)
      startUpdater(() => mainWindow, runtime.isSessionActive)

      app.on('activate', () => {
        ensureMainWindow()
      })
    })
    .catch((err) => {
      log.error('app boot failed', err)
      app.quit()
    })

  app.on('window-all-closed', () => {
    if (process.platform === 'darwin') return
    // En production, le garde reste résident afin que fermer la fenêtre Vethos
    // ne désarme jamais les overlays. En développement, il reste seulement si
    // une session de blocage réelle est active.
    if (!isDev || isBlockingSessionActive()) return
    app.quit()
  })

  const gotLock = app.requestSingleInstanceLock()
  if (!gotLock) {
    app.quit()
  } else {
    app.on('second-instance', () => {
      void app.whenReady().then(() => ensureMainWindow())
    })
  }

  app.on('before-quit', (event) => {
    stopProcessWindowProbe()
    if (quitAfterDebounceFlush) {
      clearCrashMarker()
      return
    }
    const win = mainWindow
    if (!win || win.isDestroyed()) {
      clearCrashMarker()
      return
    }

    event.preventDefault()
    win.webContents.send(IPC_CHANNELS.APP_FLUSH_DEBOUNCES)
    setTimeout(() => {
      quitAfterDebounceFlush = true
      clearCrashMarker()
      app.quit()
    }, 650)
  })

  process.on('uncaughtException', (err) => {
    handleFatalProcessError('uncaught exception', err)
  })

  process.on('unhandledRejection', (err) => {
    handleFatalProcessError('unhandled rejection', err)
  })

  process.on('SIGINT', () => {
    clearCrashMarker()
    app.quit()
  })

  process.on('SIGTERM', () => {
    clearCrashMarker()
    app.quit()
  })
}
