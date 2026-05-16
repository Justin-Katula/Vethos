import log, { setupLogging } from './logging/setup'
import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { createStorage } from './storage'
import { registerAllIpcHandlers } from './ipc'
import { ensureElevatedAtStartup } from './blocking/elevation'
import { focusWindow } from './notifications'
import { startUpdater } from './updater/setup'
import { createServiceClient } from './service-client/client'
import { IPC_CHANNELS } from '@shared/ipc-channels'

// Init logging avant toute autre logique main (cf. setup.ts pour le pourquoi
// du module paresseux).
setupLogging()

const isDev = !app.isPackaged

if (process.platform === 'win32') {
  app.setAppUserModelId('com.nexus.blocking')
}

function sendWindowsDummyKeystrokeIfAvailable(): void {
  if (process.platform !== 'win32') return
  try {
    const require = createRequire(import.meta.url)
    const mod = require('windows-dummy-keystroke') as {
      sendDummyKeystroke?: () => void
      default?: { sendDummyKeystroke?: () => void }
    }
    const send = mod.sendDummyKeystroke ?? mod.default?.sendDummyKeystroke
    send?.()
  } catch (err) {
    log.debug('windows-dummy-keystroke unavailable', err)
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

  const storage = createStorage(app.getPath('userData'))
  await registerAllIpcHandlers(storage, () => mainWindow)

  mainWindow = createMainWindow()
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  startUpdater(() => mainWindow)

  // Phase 1 P16 : on vérifie seulement que le pont service répond.
  // Le blocage reste dans le main jusqu'à la Phase 2.
  const serviceClient = createServiceClient()
  setTimeout(() => {
    serviceClient
      .request('GET_SERVICE_INFO')
      .then((info) => log.info('[main] service joignable', info))
      .catch((err) => log.warn('[main] service injoignable', err.message))
  }, 1500)

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

sendWindowsDummyKeystrokeIfAvailable()
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
  if (quitAfterDebounceFlush) return
  const win = mainWindow
  if (!win || win.isDestroyed()) return

  event.preventDefault()
  win.webContents.send(IPC_CHANNELS.APP_FLUSH_DEBOUNCES)
  setTimeout(() => {
    quitAfterDebounceFlush = true
    app.quit()
  }, 650)
})
