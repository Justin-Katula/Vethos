import { BrowserWindow } from 'electron'
import { join } from 'node:path'
import log from '@main/logging/setup'
import { computeOverlayPlacement, type Placement, type TargetGeometry } from './geometry'

/**
 * Un overlay par fenêtre bloquée : une fenêtre à nous, collée sur la sienne.
 *
 * Trois choix hérités de la version précédente, qui s'étaient révélés justes à
 * l'usage et que la spec a retrouvés indépendamment :
 *
 * - **Jamais `alwaysOnTop`.** L'overlay est rendu *fenêtre possédée* de sa
 *   cible (`GWLP_HWNDPARENT`, côté sidecar) : Windows le maintient alors
 *   au-dessus de son propriétaire, et de lui seul. Avec `alwaysOnTop`, plusieurs
 *   overlays se disputeraient le premier plan global.
 * - **`showInactive()`**, jamais `show()` : afficher un overlay ne doit pas
 *   voler le focus à ce que l'utilisateur est en train de faire.
 * - **`skipTaskbar` réappliqué après l'attache** : `SetWindowLongPtr` sur le
 *   propriétaire réinitialise des drapeaux Win32 de l'overlay, dont celui-là.
 *
 * Le manager ne décide de rien : il crée, place et détruit. C'est le contrôleur
 * qui dit quoi bloquer, et `geometry.ts` qui dit où — ou s'il faut masquer.
 */

export type OverlayTarget = {
  hwnd: string
  pid: number
  appName: string
  /** Le processus tournait-il AVANT le début de la session ? Décide de l'avertissement de fermeture. */
  preexisting: boolean
}

/** Taille plancher : un overlay minuscule laisserait voir la cible autour. */
const MIN_SIZE = 200

export type OverlayManager = {
  ensure: (target: OverlayTarget, geometry: TargetGeometry) => void
  place: (hwnd: string, geometry: TargetGeometry) => void
  hide: (hwnd: string) => void
  show: (hwnd: string) => void
  close: (hwnd: string) => void
  closeAll: () => void
  count: () => number
  /** HWND natif de l'overlay, pour que le sidecar l'attache à sa cible. */
  nativeHandle: (hwnd: string) => string | null
  reapplySkipTaskbar: (hwnd: string) => void
}

export function createOverlayManager(): OverlayManager {
  const overlays = new Map<string, BrowserWindow>()

  function appliquer(overlay: BrowserWindow, placement: Placement): void {
    if (overlay.isDestroyed()) return
    if (placement.kind === 'hidden') {
      // La cible est minimisée, masquée par DWM ou rend des bounds douteuses.
      // On masque plutôt que de deviner une position — c'est la règle qui
      // empêche l'overlay d'atterrir au coin 0,0.
      if (overlay.isVisible()) overlay.hide()
      return
    }
    overlay.setBounds({
      x: placement.x,
      y: placement.y,
      width: Math.max(MIN_SIZE, placement.width),
      height: Math.max(MIN_SIZE, placement.height),
    })
    if (!overlay.isVisible()) overlay.showInactive()
  }

  function ensure(target: OverlayTarget, geometry: TargetGeometry): void {
    const existant = overlays.get(target.hwnd)
    if (existant !== undefined && !existant.isDestroyed()) {
      appliquer(existant, computeOverlayPlacement(geometry))
      return
    }

    const placement = computeOverlayPlacement(geometry)
    log.info('[overlay] création', { hwnd: target.hwnd, app: target.appName, placement })

    const overlay = new BrowserWindow({
      ...(placement.kind === 'placed'
        ? {
            x: placement.x,
            y: placement.y,
            width: Math.max(MIN_SIZE, placement.width),
            height: Math.max(MIN_SIZE, placement.height),
          }
        : { width: MIN_SIZE, height: MIN_SIZE }),
      frame: false,
      transparent: false,
      // Opaque : l'overlay doit masquer complètement ce qu'il recouvre.
      backgroundColor: '#0a0a0c',
      skipTaskbar: true,
      // Focusable pour que le champ de justification accepte la saisie ; on
      // évite le vol de focus par `showInactive` plutôt que par `focusable:false`.
      focusable: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      hasShadow: false,
      show: false,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    })

    overlay.once('ready-to-show', () => {
      if (overlay.isDestroyed()) return
      if (placement.kind === 'placed') overlay.showInactive()
    })

    const params = new URLSearchParams({
      appName: target.appName,
      pid: String(target.pid),
      hwnd: target.hwnd,
      preexisting: String(target.preexisting),
    })
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    if (devUrl !== undefined && devUrl.length > 0) {
      void overlay.loadURL(`${devUrl}#/block-overlay?${params.toString()}`)
    } else {
      void overlay.loadFile(join(__dirname, '../renderer/index.html'), {
        hash: `block-overlay?${params.toString()}`,
      })
    }

    overlay.on('closed', () => {
      overlays.delete(target.hwnd)
    })

    overlays.set(target.hwnd, overlay)
  }

  function avec(hwnd: string, action: (o: BrowserWindow) => void): void {
    const overlay = overlays.get(hwnd)
    if (overlay === undefined || overlay.isDestroyed()) return
    action(overlay)
  }

  return {
    ensure,
    place: (hwnd, geometry) => avec(hwnd, (o) => appliquer(o, computeOverlayPlacement(geometry))),
    hide: (hwnd) => avec(hwnd, (o) => o.hide()),
    show: (hwnd) => avec(hwnd, (o) => o.showInactive()),
    close: (hwnd) => {
      avec(hwnd, (o) => o.close())
      overlays.delete(hwnd)
    },
    closeAll: () => {
      for (const overlay of overlays.values()) {
        if (!overlay.isDestroyed()) overlay.close()
      }
      overlays.clear()
      log.info('[overlay] tous fermés')
    },
    count: () => overlays.size,
    nativeHandle: (hwnd) => {
      const overlay = overlays.get(hwnd)
      if (overlay === undefined || overlay.isDestroyed()) return null
      const buf = overlay.getNativeWindowHandle()
      // Chaîne décimale, comme tous les HWND du protocole : une valeur 64 bits
      // dépasse la précision entière de JavaScript.
      if (buf.length >= 8) return buf.readBigUInt64LE(0).toString()
      if (buf.length >= 4) return String(buf.readUInt32LE(0))
      return null
    },
    // À rappeler après chaque `own-overlay` : SetWindowLongPtr sur le
    // propriétaire réinitialise ce drapeau, et l'overlay réapparaîtrait dans
    // la barre des tâches.
    reapplySkipTaskbar: (hwnd) => avec(hwnd, (o) => o.setSkipTaskbar(true)),
  }
}
