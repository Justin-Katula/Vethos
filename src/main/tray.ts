import { app, Menu, nativeImage, Tray, type MenuItemConstructorOptions } from 'electron'
import log from './logging/setup'
import { resolveAppIconPath } from './app-icon'

/**
 * Zone de notification — ce qui permet à Vethos de tenir sa promesse la plus
 * importante : continuer à bloquer même quand l'utilisateur a fermé la fenêtre.
 *
 * « Fermer la fenêtre » et « quitter l'application » sont deux actions
 * distinctes, et les confondre est le piège de conception de ce module :
 *
 *   ✕ sur la fenêtre        la fenêtre disparaît, le processus continue, le
 *                           blocage continue
 *   « Quitter Vethos »      le processus s'arrête, le blocage s'arrête
 *
 * L'utilisateur n'est jamais contraint de garder Vethos visible. Le bouton ✕
 * se comporte comme dans n'importe quelle application — c'est le modèle de
 * Discord, Spotify ou d'un antivirus.
 *
 * La partie décisionnelle est extraite en fonctions pures pour être testée
 * sans instancier Electron.
 */

export type TrayMenuItem =
  | { kind: 'open'; label: string; enabled: boolean }
  | { kind: 'separator' }
  | { kind: 'quit'; label: string; enabled: boolean; reason?: string }

/**
 * Contenu du menu de la zone de notification.
 *
 * « Quitter Vethos » est refusé pendant une session de blocage active : sans
 * ça, ce serait un contournement gratuit de tout le mécanisme. Hors session,
 * il quitte normalement.
 */
export function buildTrayMenuItems(state: { sessionActive: boolean }): TrayMenuItem[] {
  return [
    { kind: 'open', label: 'Ouvrir Vethos', enabled: true },
    { kind: 'separator' },
    state.sessionActive
      ? {
          kind: 'quit',
          label: 'Quitter Vethos',
          enabled: false,
          reason: 'Impossible pendant une session de blocage',
        }
      : { kind: 'quit', label: 'Quitter Vethos', enabled: true },
  ]
}

/**
 * Vethos doit-il démarrer sans afficher sa fenêtre ?
 *
 * Le lancement automatique à l'ouverture de session passe `--hidden` : on
 * apparaît directement dans la zone de notification, sans surgir devant
 * l'utilisateur à chaque démarrage de Windows.
 */
export function shouldStartHidden(argv: readonly string[]): boolean {
  return argv.includes('--hidden')
}

/**
 * Cherche une icône exploitable et se rabat sur une image vide plutôt que de
 * faire échouer la création de la zone de notification : mieux vaut une icône
 * absente qu'un blocage qui ne démarre pas.
 */
export function resolveTrayIconPath(): string | null {
  return resolveAppIconPath() ?? null
}

export type TrayDeps = {
  /** Affiche et met au premier plan la fenêtre principale, la recréant au besoin. */
  showMainWindow: () => void
  /** Une session de blocage est-elle en cours ? Décide si Quitter est permis. */
  isSessionActive: () => boolean
  /** Demande l'arrêt réel de l'application. */
  requestQuit: () => void
}

let tray: Tray | null = null

function toElectronTemplate(
  items: readonly TrayMenuItem[],
  deps: TrayDeps,
): MenuItemConstructorOptions[] {
  return items.map((item) => {
    if (item.kind === 'separator') return { type: 'separator' }
    if (item.kind === 'open') {
      return { label: item.label, enabled: item.enabled, click: () => deps.showMainWindow() }
    }
    return {
      // Le motif du refus est visible dans le libellé : un élément grisé sans
      // explication laisserait l'utilisateur croire à un bug.
      label: item.enabled ? item.label : `${item.label} — ${item.reason ?? 'indisponible'}`,
      enabled: item.enabled,
      click: () => deps.requestQuit(),
    }
  })
}

/** Reconstruit le menu — à appeler quand l'état de session change. */
export function refreshTrayMenu(deps: TrayDeps): void {
  if (tray === null) return
  const items = buildTrayMenuItems({ sessionActive: deps.isSessionActive() })
  tray.setContextMenu(Menu.buildFromTemplate(toElectronTemplate(items, deps)))
}

export function createVethosTray(deps: TrayDeps): Tray | null {
  if (tray !== null) return tray

  const iconPath = resolveTrayIconPath()
  const image = iconPath === null ? nativeImage.createEmpty() : nativeImage.createFromPath(iconPath)
  if (iconPath === null) {
    log.warn('[tray] aucune icône trouvée — la zone de notification sera sans image')
  }

  try {
    tray = new Tray(image)
  } catch (err) {
    // Sans zone de notification l'utilisateur n'a plus aucun moyen de rouvrir
    // la fenêtre : on le signale fort plutôt que de continuer en silence.
    log.error('[tray] création impossible', err)
    return null
  }

  tray.setToolTip('Vethos')
  tray.on('double-click', () => deps.showMainWindow())
  refreshTrayMenu(deps)
  return tray
}

export function destroyVethosTray(): void {
  tray?.destroy()
  tray = null
}

/**
 * Lancement automatique à l'ouverture de session Windows.
 *
 * C'est ce qui fait tenir le comportement « alarme » à travers un
 * redémarrage : sans lui, éteindre la machine suffirait à lever le blocage
 * jusqu'au prochain lancement manuel.
 */
export function configureAutoStart(enabled: boolean): void {
  if (process.platform !== 'win32') return
  try {
    app.setLoginItemSettings({ openAtLogin: enabled, args: ['--hidden'] })
  } catch (err) {
    log.warn('[tray] impossible de configurer le lancement au démarrage', err)
  }
}
