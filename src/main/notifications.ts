/**
 * notifications.ts
 *
 * Système de notifications Windows natives pour Vethos.
 * Deux types combinés (comme demandé dans le prompt) :
 * 1. Notification Windows native pour appeler l'attention
 * 2. Quand l'utilisateur clique → fenêtre Vethos s'ouvre avec overlay interne
 */

import { Notification, BrowserWindow } from 'electron'
import { isWithinSleep } from '@shared/sleep'
import log from './logging/setup'

export type VethosNotification = {
  title: string
  body: string
  /** Données à envoyer au renderer quand l'utilisateur clique */
  payload?: Record<string, unknown>
}

/**
 * Heures de sommeil connues du processus principal.
 *
 * Elles sont poussées par le renderer au chargement des paramètres. Tant
 * qu'elles sont inconnues, aucune plage n'est protégée — mais dès qu'elles le
 * sont, le garde-fou s'applique à TOUTES les notifications, sans exception
 * possible pour l'une d'entre elles (critère 3).
 */
let sleepWindow: { start?: string; end?: string } = {}

export function setSleepWindow(start: string | undefined, end: string | undefined): void {
  sleepWindow = { start, end }
}

/** Critère 3 : aucune notification pendant les heures de sommeil. */
export function isSleepingNow(now: Date = new Date()): boolean {
  return isWithinSleep(now, sleepWindow.start, sleepWindow.end)
}

/**
 * Envoie une notification Windows native.
 * Quand cliquée, focus la fenêtre Vethos et envoie un événement au renderer.
 */
export function sendNativeNotification(
  notif: VethosNotification,
  getMainWindow: () => BrowserWindow | null,
): void {
  // Critère 3 : aucune exception, à aucun niveau. Le point de passage est
  // unique pour que personne ne puisse le contourner en appelant plus bas.
  if (isSleepingNow()) {
    log.info('notification supprimée — heures de sommeil', notif.title)
    return
  }
  if (!Notification.isSupported()) {
    log.warn('native notifications unsupported', notif.title)
    return
  }

  const n = new Notification({
    title: notif.title,
    body: notif.body,
    icon: undefined, // L'icône par défaut de l'app sera utilisée
    silent: false,
  })

  n.on('click', () => {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      focusWindow(win)
      // Canal historique conservé pour le renderer existant.
      win.webContents.send('nexus:notification-clicked', {
        title: notif.title,
        body: notif.body,
        payload: notif.payload,
      })
    }
  })

  n.show()
}

export function focusWindow(win: BrowserWindow): void {
  const wasMaximized = win.isMaximized()
  if (win.isMinimized()) win.restore()
  if (wasMaximized) win.maximize()
  win.show()
  win.focus()
  if (process.platform === 'win32') {
    win.setAlwaysOnTop(true)
    setTimeout(() => {
      if (!win.isDestroyed()) win.setAlwaysOnTop(false)
    }, 100)
  }
}

// ─── Notifications prédéfinies ──────────────────────────────────────────────

export function notifyCrashRecovered(getMainWindow: () => BrowserWindow | null): void {
  sendNativeNotification(
    {
      title: 'Crash récupéré',
      body: 'Vethos a restauré son état après un arrêt inattendu.',
      payload: { type: 'crash-recovered' },
    },
    getMainWindow,
  )
}

export function notifyUpdateReady(
  version: string | undefined,
  getMainWindow: () => BrowserWindow | null,
): void {
  sendNativeNotification(
    {
      title: 'Mise à jour disponible',
      body: version
        ? `Vethos ${version} est disponible et se téléchargera en arrière-plan.`
        : 'Une mise à jour Vethos est disponible.',
      payload: { type: 'update-ready', version },
    },
    getMainWindow,
  )
}

// Le moteur de planification ne notifie personne : il produit des faits
// chiffrés (C.3.2, F). La livraison à l'utilisateur appartient au futur point
// Coach — aucun canal de notification de tâche n'existe donc ici.
