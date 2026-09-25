import log, { setupLogging } from './logging/setup'
import { app, BrowserWindow, nativeTheme, powerMonitor, shell } from 'electron'
import { join } from 'node:path'
import { existsSync, rmSync, writeFileSync } from 'node:fs'
import { createStorage } from '@shared/storage'
import { creerCoffre } from '@main/securite/coffre'
import { definirCleDeepSeek } from '@main/blocking/deepseek'
import { registerAllIpcHandlers } from './ipc'
import { focusWindow, notifyCrashRecovered } from './notifications'
import { startUpdater } from './updater/setup'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import { appIconWindowOptions } from './app-icon'
import { getMainProcessTheme, setMainProcessTheme, themeWindowOptions } from './theme-chrome'
import {
  DEFAULT_DARK_AT,
  DEFAULT_LIGHT_AT,
  DEFAULT_THEME_MODE,
  resolveTheme,
  type Theme,
} from '@shared/theme'
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
import { stopProcessWindowProbe } from './tracking/process-window-probe'
import { createConfirmationOverlay } from './planning/confirmation-overlay'
import { createPlanRunner, type PlanRunner } from './planning/plan-runner'

/**
 * Rendu du texte en niveaux de gris, jamais en sous-pixels.
 *
 * Sur Windows, Chromium lisse le texte par sous-pixels (ClearType). Sur un fond
 * presque noir avec une graisse fine, chaque glyphe se retrouve bordé de
 * franges roses et vertes : les chiffres du tableau et les petits libellés
 * paraissent sales. Aucune règle CSS ne le corrige de façon fiable ici, et le
 * commutateur doit être posé avant que l'application soit prête.
 */
app.commandLine.appendSwitch('disable-lcd-text')

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

/** Le thème à peindre au démarrage, lu depuis les réglages persistés. */
async function readStartupTheme(storage: ReturnType<typeof createStorage>): Promise<Theme> {
  try {
    const settings = await storage.read('settings')
    return resolveTheme(
      {
        mode: settings?.theme ?? DEFAULT_THEME_MODE,
        systemDark: nativeTheme.shouldUseDarkColors,
        schedule: {
          lightAt: settings?.themeLightAt ?? DEFAULT_LIGHT_AT,
          darkAt: settings?.themeDarkAt ?? DEFAULT_DARK_AT,
        },
      },
      new Date(),
    )
  } catch (err) {
    log.warn('[theme] réglages illisibles au démarrage, ouverture en clair', err)
    return 'light'
  }
}

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false, // affichée seulement après ready-to-show
    autoHideMenuBar: true,
    title: 'Vethos',
    ...appIconWindowOptions(),
    titleBarStyle: 'hidden',
    // Fond de fenêtre et barre système : la couleur de fond du thème en cours,
    // pas une constante. La barre fait partie du hall, aucune boîte visible.
    ...themeWindowOptions(getMainProcessTheme()),
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

  // Liens externes : ouvrir dans le navigateur, pas dans Electron.
  //
  // On n'ouvre que http et https. `shell.openExternal` confie l'adresse au système :
  // un `file://` ouvrirait un fichier local, et un protocole applicatif lancerait le
  // programme qui l'a enregistré. Une page qui appelle `window.open` ne doit pas
  // pouvoir déclencher cela.
  win.webContents.setWindowOpenHandler(({ url }) => {
    let protocole = ''
    try {
      protocole = new URL(url).protocol
    } catch {
      protocole = ''
    }
    if (protocole === 'http:' || protocole === 'https:') {
      void shell.openExternal(url).catch((err) => log.warn('[fenetre] ouverture externe impossible', err))
    } else {
      log.warn('[fenetre] ouverture refusée pour un protocole non web', { url })
    }
    return { action: 'deny' }
  })

  // Navigation EN PLACE : la fenêtre ne doit jamais quitter l'application.
  //
  // `setWindowOpenHandler` ci-dessus ne couvre que les nouvelles fenêtres. Un lien
  // ordinaire, un formulaire, ou un `location.href` remplaceraient l'interface par
  // une page distante — qui hériterait du preload et donc de tout le pont IPC.
  // On n'autorise que l'origine que l'on a chargée soi-même.
  win.webContents.on('will-navigate', (event, url) => {
    const actuelle = win.webContents.getURL()
    let memeOrigine = false
    try {
      memeOrigine = new URL(url).origin === new URL(actuelle).origin
    } catch {
      memeOrigine = false
    }
    if (memeOrigine) return
    event.preventDefault()
    log.warn('[fenetre] navigation refusée hors de l’application', { url })
  })

  // Si le rendu meurt, on le relance.
  //
  // Le processus principal, lui, survit — et il continue de bloquer. Sans ce
  // rattrapage l'utilisateur se retrouverait devant une fenêtre vide, sans aucun
  // moyen de lever la session : le pire état possible pour une application de
  // blocage. `killed` est exclu : c'est nous qui fermons, pas un plantage.
  win.webContents.on('render-process-gone', (_event, details) => {
    log.error('[fenetre] le rendu s’est arrêté', details)
    if (details.reason === 'killed' || details.reason === 'clean-exit') return
    if (win.isDestroyed()) return
    void win.webContents.reload()
  })

  // Aucune permission web n'est nécessaire : ni caméra, ni micro, ni position, ni
  // notifications par le rendu (elles passent par le processus principal).
  win.webContents.session.setPermissionRequestHandler((_contents, permission, callback) => {
    log.warn('[fenetre] permission refusée', { permission })
    callback(false)
  })

  const charge =
    isDev && process.env['ELECTRON_RENDERER_URL']
      ? win.loadURL(process.env['ELECTRON_RENDERER_URL'])
      : win.loadFile(join(__dirname, '../renderer/index.html'))
  void charge.catch((err) => log.error('[fenetre] chargement du rendu impossible', err))

  return win
}

let mainWindow: BrowserWindow | null = null
let quitReady = false
let quitPreparation: Promise<void> | null = null

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
const enforcer = createEnforcer({ onBlockedAttempt: () => void planRunner?.recordBlockedAttempt() })

/**
 * Horloge de planification (D.7/D.8), créée une fois l'application prête —
 * elle a besoin du storage. Le pont vers `registerAllIpcHandlers` (appelé
 * avant qu'elle existe) passe par une fermeture lisant cette variable au
 * moment de l'appel, jamais à l'enregistrement : même patron que
 * `getBlockingSession` juste en dessous.
 */
let planRunner: PlanRunner | null = null

/** Fenêtre « Je commence ». Créée au chargement pour qu'un arrêt précoce puisse la fermer. */
const confirmationOverlay = createConfirmationOverlay()

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

      // Chiffrement au repos. Les fichiers deja ecrits en clair restent lisibles
      // et se chiffrent a leur prochaine ecriture : rien n'est perdu a la mise a jour.
      const storage = createStorage(app.getPath('userData'), creerCoffre())
      // Avant la fenêtre : une fenêtre créée sur le mauvais fond montre un
      // éclair blanc à chaque ouverture en thème sombre, et l'inverse.
      setMainProcessTheme(await readStartupTheme(storage))
      // La cle DeepSeek enregistree par l'utilisateur, appliquee des le demarrage.
      definirCleDeepSeek((await storage.read('settings').catch(() => null))?.deepseekApiKey)
      await registerAllIpcHandlers(
        storage,
        () => mainWindow,
        () => blockingClock?.current() ?? { active: false, blockedAppIds: [], endsAt: null },
        (blockId) =>
          planRunner?.confirmBlock(blockId) ??
          Promise.resolve({ ok: false, reason: "Le planificateur n'est pas encore prêt." }),
        (args) =>
          planRunner?.stopBlock(args) ??
          Promise.resolve({ ok: false, reason: "Le planificateur n'est pas encore prêt." }),
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
          return stored ?? { block: null }
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

      // D.7/D.8 : l'horloge de planification tourne indépendamment de
      // l'horloge de blocage — l'une décide QUAND confirmer un bloc et
      // mesurer son retard, l'autre QUOI bloquer une fois que c'est fait.
      // `onBlockConfirmed` les relie : dès qu'une session de blocage est
      // écrite, le contrôleur de blocage se réconcilie tout de suite plutôt
      // que d'attendre son propre tic.
      planRunner = createPlanRunner({
        storage,
        overlay: confirmationOverlay,
        now: () => new Date(),
        onBlockConfirmed: () => void blockingClock?.tickNow(),
        // Sans ce pont, une fenêtre déjà ouverte n'apprend jamais qu'un bloc a
        // été raté ou confirmé pendant qu'elle tournait : le store du
        // renderer ne relit le storage qu'une fois, à son propre chargement.
        onPlanningDataChanged: () => {
          const win = mainWindow
          if (win && !win.isDestroyed()) win.webContents.send(IPC_CHANNELS.PLANNING_EVENT_CHANGED)
        },
        onError: (err) => log.warn('[planning] tic impossible', err),
      })
      planRunner.start()

      // Réveils indispensables : une machine en veille pendant tout un créneau
      // doit bloquer dès son réveil, sans attendre le tic suivant.
      powerMonitor.on('resume', () => {
        log.info('[blocage] sortie de veille — réconciliation immédiate')
        void blockingClock?.tickNow()
        void planRunner?.tickNow()
      })
      powerMonitor.on('unlock-screen', () => {
        log.info('[blocage] session déverrouillée — réconciliation immédiate')
        void blockingClock?.tickNow()
        void planRunner?.tickNow()
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

  app.on('will-quit', () => destroyVethosTray())

  app.on('before-quit', (event) => {
    if (quitReady) return
    event.preventDefault()
    isQuitting = true
    if (quitPreparation !== null) return

    const win = mainWindow
    if (win && !win.isDestroyed()) win.webContents.send(IPC_CHANNELS.APP_FLUSH_DEBOUNCES)

    quitPreparation = new Promise<void>((resolve) => setTimeout(resolve, 650))
      .then(async () => {
        blockingClock?.stop()
        planRunner?.stop()
        confirmationOverlay.close()
        // La restauration est une barrière d'arrêt, pas un message lancé sans
        // attente. Le son et la barre des tâches sont confirmés par la sonde
        // avant que le processus Electron puisse disparaître.
        await enforcer.shutdown()
        await stopProcessWindowProbe()
        destroyVethosTray()
        clearCrashMarker()
      })
      .catch((err) => log.error('[app] préparation de l’arrêt incomplète', err))
      .finally(() => {
        quitReady = true
        app.quit()
      })
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
