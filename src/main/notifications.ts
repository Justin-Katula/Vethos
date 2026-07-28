/**
 * notifications.ts
 *
 * Système de notifications Windows natives pour Nexus.
 * Deux types combinés (comme demandé dans le prompt) :
 * 1. Notification Windows native pour appeler l'attention
 * 2. Quand l'utilisateur clique → fenêtre Nexus s'ouvre avec overlay interne
 */

import { Notification, BrowserWindow } from 'electron'
import log from './logging/setup'

export type NexusNotification = {
  title: string
  body: string
  /** Données à envoyer au renderer quand l'utilisateur clique */
  payload?: Record<string, unknown>
}

/**
 * Envoie une notification Windows native.
 * Quand cliquée, focus la fenêtre Nexus et envoie un événement au renderer.
 */
export function sendNativeNotification(
  notif: NexusNotification,
  getMainWindow: () => BrowserWindow | null,
): void {
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
      // Envoyer l'événement au renderer pour afficher l'overlay interne
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

export function notifyTaskUrgent(
  taskTitle: string,
  daysLeft: number,
  getMainWindow: () => BrowserWindow | null,
): void {
  sendNativeNotification(
    {
      title: 'Tâche urgente',
      body: `"${taskTitle}" est due dans ${daysLeft <= 0 ? "aujourd'hui" : daysLeft === 1 ? 'demain' : `${daysLeft} jours`} !`,
      payload: { type: 'task-urgent', taskTitle, daysLeft },
    },
    getMainWindow,
  )
}

/**
 * Événements de tâche routés via l'IPC `tasks:notify`.
 *
 * Les anciennes variantes liées au système de niveaux (task-hit-zero,
 * task-forced-three, task-degraded, task-auto-rescued, task-urgent) ont été
 * supprimées avec le moteur de planification legacy. La notification
 * d'urgence reste disponible via `notifyTaskUrgent`.
 */
export type TaskNotifyEvent = {
  type: never
}

export function notifyTaskEvent(
  _event: TaskNotifyEvent,
  _getMainWindow: () => BrowserWindow | null,
): void {
  // Plus aucun variant actif. La fonction est conservée pour préserver le
  // contrat IPC `tasks:notify` ; elle n'émet plus rien.
}
