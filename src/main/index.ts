import log, { setupLogging } from './logging/setup'
import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { existsSync, rmSync, writeFileSync } from 'node:fs'
import { createStorage } from '@service/storage'
import { registerAllIpcHandlers } from './ipc'
import { ensureElevatedAtStartup } from './blocking/elevation'
import { focusWindow, notifyCrashRecovered } from './notifications'
import { startUpdater } from './updater/setup'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import { recalculateFreeTimeAtBoot } from './free-time/recalculate'
import { ensureServiceRunning } from './service-launcher'

// Init logging avant toute autre logique main (cf. setup.ts pour le pourquoi
// du module paresseux).
setupLogging()

const isDev = !app.isPackaged

if (process.platform === 'win32') {
  app.setAppUserModelId('com.nexus.blocking')
}

function crashMarkerPath(): string {
  return join(app.getPath('userData'), 'nexus-main-alive.marker')
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

app.whenReady().then(async () => {
  await ensureElevatedAtStartup()
  const recoveredFromCrash = existsSync(crashMarkerPath())
  writeCrashMarker()

  // P16 Lot 4b : lance le service de blocage (process détaché) s'il ne tourne
  // pas déjà, après migration des données vers C:\ProgramData\Nexus. Placé
  // après ensureElevatedAtStartup (la migration écrit dans ProgramData) et
  // avant registerAllIpcHandlers (dont le relais se connectera au service).
  await ensureServiceRunning()

  const storage = createStorage(app.getPath('userData'))
  await recalculateFreeTimeAtBoot(storage).catch((err) => {
    log.warn('boot free-time recalculation failed', err)
  })
  const runtime = await registerAllIpcHandlers(storage, () => mainWindow)

  mainWindow = createMainWindow()
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (recoveredFromCrash) notifyCrashRecovered(() => mainWindow)
  startUpdater(() => mainWindow, runtime.isSessionActive)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow()
      mainWindow.on('closed', () => {
        mainWindow = null
      })
    }
  })
}).catch((err) => {
  log.error('app boot failed', err)
  app.quit()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      focusWindow(mainWindow)
    }
  })
}

app.on('before-quit', (event) => {
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
