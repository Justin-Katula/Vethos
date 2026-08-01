import log, { setupLogging } from './logging/setup'
import { app, BrowserWindow, powerMonitor, shell } from 'electron'
import { join } from 'node:path'
import { existsSync, rmSync, writeFileSync } from 'node:fs'
import { createStorage } from '@shared/storage'
import { registerAllIpcHandlers } from './ipc'
import { focusWindow, notifyCrashRecovered } from './notifications'
import { startUpdater } from './updater/setup'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import {
  configureAutoStart,
  createVethosTray,
  destroyVethosTray,
  refreshTrayMenu,
  shouldStartHidden,
  type TrayDeps,
} from './tray'
import { createReconciliationClock, type ReconciliationClock } from './blocking/clock'
import { createEnforcer } from './blocking/enforcer'
import type { BlockingRules } from './blocking/schedule'

// Init logging avant toute autre logique main (cf. setup.ts pour le pourquoi
// du module paresseux).
setupLogging()

startNexusApp()

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
    // `--hidden` : lancement automatique à l'ouverture de session Windows. On
    // démarre directement dans la zone de notification, sans surgir devant
    // l'utilisateur à chaque démarrage.
    if (!shouldStartHidden(process.argv)) win.show()
  })

  // Fermer la fenêtre ne quitte PAS l'application : le processus continue et
  // le blocage avec lui. Une application de blocage qui ne tourne pas ne
  // bloque rien. Seul « Quitter Vethos » depuis la zone de notification
  // arrête réellement le processus.
  win.on('close', (event) => {
    if (isQuitting) return
    event.preventDefault()
    win.hide()
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

/**
 * Vrai uniquement quand un arrêt réel a été demandé. Distingue « fermer la
 * fenêtre » (masquage) de « quitter Vethos » (arrêt du processus).
 */
let isQuitting = false

/**
 * Une session de blocage est-elle en cours ?
 *
 * Reste `false` tant que le contrôleur de blocage n'est pas branché — aucune
 * session ne peut être active sans lui. Le menu de la zone de notification
 * s'appuie dessus pour refuser « Quitter Vethos » pendant un blocage.
 */
let blockingSessionActive = false

/** Horloge de réconciliation, créée une fois l'application prête. */
let blockingClock: ReconciliationClock | null = null

/**
 * Exécuteur du blocage : traduit les décisions de l'horloge en actions réelles
 * sur les fenêtres. Créé au chargement du module pour qu'un arrêt précoce
 * puisse déjà lui demander de tout restaurer.
 */
const enforcer = createEnforcer()

function showMainWindow(): void {
  if (mainWindow === null || mainWindow.isDestroyed()) {
    mainWindow = createMainWindow()
    mainWindow.on('closed', () => {
      mainWindow = null
    })
    return
  }
  if (!mainWindow.isVisible()) mainWindow.show()
  focusWindow(mainWindow)
}

const trayDeps: TrayDeps = {
  showMainWindow,
  isSessionActive: () => blockingSessionActive,
  requestQuit: () => {
    if (blockingSessionActive) {
      log.warn('[tray] arrêt refusé : une session de blocage est active')
      return
    }
    isQuitting = true
    app.quit()
  },
}

/** Appelé par le contrôleur de blocage à chaque changement d'état de session. */
export function setBlockingSessionActive(active: boolean): void {
  if (blockingSessionActive === active) return
  blockingSessionActive = active
  refreshTrayMenu(trayDeps)
}

function startNexusApp(): void {
  app
    .whenReady()
    .then(async () => {
      const recoveredFromCrash = existsSync(crashMarkerPath())
      writeCrashMarker()

      const storage = createStorage(app.getPath('userData'))
      await registerAllIpcHandlers(
        storage,
        () => mainWindow,
        () => blockingClock?.current() ?? { active: false, blockedAppIds: [], endsAt: null },
      )

      mainWindow = createMainWindow()
      mainWindow.on('closed', () => {
        mainWindow = null
      })

      if (recoveredFromCrash) notifyCrashRecovered(() => mainWindow)
      startUpdater(() => mainWindow)

      createVethosTray(trayDeps)
      configureAutoStart(true)

      blockingClock = createReconciliationClock({
        readRules: async (): Promise<BlockingRules> => {
          const stored = await storage.read('blocking_rules')
          return stored ?? { slots: [], manual: null }
        },
        now: () => new Date(),
        onTransition: (transition, snapshot) => {
          log.info('[blocage] transition de session', transition)
          setBlockingSessionActive(transition.kind !== 'ended')

          // C'est ici que la décision devient action : l'horloge dit qu'il
          // faut bloquer, l'exécuteur bloque. Une erreur d'application ne doit
          // jamais faire tomber l'horloge — elle réessaiera au tic suivant.
          void enforcer.apply(snapshot).catch((err) => {
            log.error('[blocage] application de la session impossible', err)
          })

          const win = mainWindow
          if (win && !win.isDestroyed()) {
            win.webContents.send(IPC_CHANNELS.BLOCKING_EVENT_SESSION, snapshot)
          }
        },
        onError: (err) => log.warn('[blocage] lecture des règles impossible', err),
      })
      blockingClock.start()

      // Réveils indispensables : une machine en veille pendant tout un créneau
      // doit bloquer dès son réveil, sans attendre le tic suivant.
      powerMonitor.on('resume', () => {
        log.info('[blocage] sortie de veille — réconciliation immédiate')
        void blockingClock?.tickNow()
      })
      powerMonitor.on('unlock-screen', () => {
        log.info('[blocage] session déverrouillée — réconciliation immédiate')
        void blockingClock?.tickNow()
      })

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          mainWindow = createMainWindow()
          mainWindow.on('closed', () => {
            mainWindow = null
          })
        }
      })
    })
    .catch((err) => {
      log.error('app boot failed', err)
      app.quit()
    })

  // Ne quitte PAS quand la dernière fenêtre disparaît : Vethos vit dans la
  // zone de notification et continue de bloquer. C'est ce qui lui permet de
  // se comporter comme une alarme — il sait qu'il est l'heure même si
  // l'utilisateur a fermé la fenêtre il y a trois heures.
  app.on('window-all-closed', () => {
    log.info('[app] fenêtre fermée — Vethos continue en zone de notification')
  })

  const gotLock = app.requestSingleInstanceLock()
  if (!gotLock) {
    app.quit()
  } else {
    app.on('second-instance', () => {
      // Relancer Vethos alors qu'il tourne déjà rouvre la fenêtre au lieu de
      // démarrer un second processus — y compris quand il était masqué.
      showMainWindow()
    })
  }

  app.on('will-quit', () => {
    blockingClock?.stop()
    // Restaure barre des tâches et son de toutes les applications touchées.
    // Quitter Vethos ne doit jamais laisser une application muette ou absente
    // de la barre des tâches.
    void enforcer.stop()
    destroyVethosTray()
  })

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
}
