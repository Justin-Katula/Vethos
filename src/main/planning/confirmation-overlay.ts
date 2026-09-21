import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import log from '@main/logging/setup'
import type { PlacedBlock } from '@shared/planning/types'

/**
 * La fenêtre « Je commence » — D.7/D.8.
 *
 * Contrairement aux overlays de blocage, qui recouvrent les fenêtres cibles
 * sans jamais voler le focus, celui-ci est la « friction nouvelle » assumée
 * par D.8 : un verrou plein écran, qui PREND le focus, parce que la question
 * qu'il pose (« ce bloc commence, tu t'y mets ? ») n'a de sens que si elle
 * interrompt vraiment ce qui se passait avant.
 *
 * Une seule instance à la fois : au plus un bloc peut être en attente de
 * confirmation à un instant donné (voir `@shared/planning/clock.ts`), donc au plus une
 * fenêtre.
 */

export type PendingBlockView = {
  blockId: string
  kind: PlacedBlock['kind']
  label: string
  startMinute: number
  appsToBlock: string[]
}

export type ConfirmationOverlay = {
  /** Affiche (ou met à jour) l'overlay pour ce bloc. Idempotent sur le même blockId. */
  show: (block: PendingBlockView) => void
  /** Ferme l'overlay s'il est ouvert. */
  close: () => void
  /** blockId actuellement affiché, ou null. */
  currentBlockId: () => string | null
}

export function createConfirmationOverlay(): ConfirmationOverlay {
  let win: BrowserWindow | null = null
  let shownBlockId: string | null = null

  function build(): BrowserWindow {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize
    const overlay = new BrowserWindow({
      width,
      height,
      frame: false,
      fullscreen: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      // Empêche la fermeture par la chrome OS (Alt+F4, etc.) — seul le bouton
      // « Je commence » de la page doit pouvoir faire disparaître ce verrou.
      // Le processus main garde la main : `close()` ci-dessous détruit quand
      // même la fenêtre depuis le code, `closable` ne bride que l'utilisateur.
      closable: false,
      hasShadow: false,
      backgroundColor: '#000000',
      show: false,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    })

    overlay.setAlwaysOnTop(true, 'screen-saver')

    overlay.on('closed', () => {
      if (win === overlay) {
        win = null
        shownBlockId = null
      }
    })

    return overlay
  }

  function urlFor(block: PendingBlockView): { devHash: string; prodHash: string } {
    const params = new URLSearchParams({
      blockId: block.blockId,
      kind: block.kind,
      label: block.label,
      startMinute: String(block.startMinute),
      apps: block.appsToBlock.join(','),
    })
    return {
      devHash: `#/session-start?${params.toString()}`,
      prodHash: `session-start?${params.toString()}`,
    }
  }

  function show(block: PendingBlockView): void {
    if (shownBlockId === block.blockId && win !== null && !win.isDestroyed()) {
      if (!win.isVisible()) win.show()
      win.focus()
      return
    }

    if (win !== null && !win.isDestroyed()) win.destroy()

    log.info('[planning] overlay « Je commence »', { blockId: block.blockId, kind: block.kind })
    const overlay = build()
    win = overlay
    shownBlockId = block.blockId

    const { devHash, prodHash } = urlFor(block)
    const reveal = () => {
      if (overlay.isDestroyed()) return
      if (!overlay.isVisible()) overlay.show()
      overlay.focus()
    }

    overlay.once('ready-to-show', reveal)
    setTimeout(reveal, 600)

    const devUrl = process.env['ELECTRON_RENDERER_URL']
    if (devUrl !== undefined && devUrl.length > 0) {
      void overlay.loadURL(`${devUrl}${devHash}`)
    } else {
      void overlay.loadFile(join(__dirname, '../renderer/index.html'), { hash: prodHash })
    }
  }

  function close(): void {
    if (win !== null && !win.isDestroyed()) win.destroy()
    win = null
    shownBlockId = null
  }

  return { show, close, currentBlockId: () => shownBlockId }
}
