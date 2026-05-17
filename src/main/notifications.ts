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

export function notifySessionStart(
  profileName: string,
  durationMin: number,
  getMainWindow: () => BrowserWindow | null,
): void {
  sendNativeNotification(
    {
      title: 'Session démarrée',
      body: `Profil "${profileName}" actif pour ${durationMin} minutes.`,
      payload: { type: 'session-start', profileName },
    },
    getMainWindow,
  )
}

export function notifySessionEnd(
  profileName: string,
  durationMin: number,
  getMainWindow: () => BrowserWindow | null,
): void {
  sendNativeNotification(
    {
      title: 'Session terminée',
      body: `${durationMin} minutes terminées sur "${profileName}".`,
      payload: { type: 'session-end', profileName, durationMin },
    },
    getMainWindow,
  )
}

export function notifyBreakRequired(
  restMinutes: number,
  getMainWindow: () => BrowserWindow | null,
): void {
  sendNativeNotification(
    {
      title: 'Pause obligatoire',
      body: `Repos requis : ${restMinutes} minutes.`,
      payload: { type: 'break-required', restMinutes },
    },
    getMainWindow,
  )
}

export function notifyClockTamper(
  driftMs: number,
  getMainWindow: () => BrowserWindow | null,
): void {
  sendNativeNotification(
    {
      title: 'Horloge modifiée',
      body: `Nexus a détecté un saut d'horloge de ${Math.round(driftMs / 1000)} secondes.`,
      payload: { type: 'clock-tamper', driftMs },
    },
    getMainWindow,
  )
}

export function notifyCrashRecovered(getMainWindow: () => BrowserWindow | null): void {
  sendNativeNotification(
    {
      title: 'Crash récupéré',
      body: 'Nexus a restauré son état après un arrêt inattendu.',
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
        ? `Nexus ${version} est disponible et se téléchargera en arrière-plan.`
        : 'Une mise à jour Nexus est disponible.',
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
 * Notifications déclenchées par le système de niveau des tâches (V2 P9).
 * Cinq événements distincts, tous routés via le même IPC `tasks:notify`.
 */
export type TaskNotifyEvent =
  | { type: 'task-hit-zero'; taskTitle: string }
  | { type: 'task-auto-rescued'; taskTitle: string; daysLeft: number }
  | { type: 'task-forced-three'; taskTitle: string }
  | { type: 'task-degraded'; taskTitle: string; newLevel: number }
  | { type: 'task-urgent'; taskTitle: string; daysLeft: number }

export function notifyTaskEvent(
  event: TaskNotifyEvent,
  getMainWindow: () => BrowserWindow | null,
): void {
  switch (event.type) {
    case 'task-hit-zero':
      sendNativeNotification(
        {
          title: 'Tâche au niveau zéro',
          body: `"${event.taskTitle}" est tombée à 0. Reprends-la avant qu'il soit trop tard.`,
          payload: event as unknown as Record<string, unknown>,
        },
        getMainWindow,
      )
      return
    case 'task-auto-rescued':
      sendNativeNotification(
        {
          title: 'Tâche relancée automatiquement',
          body: `"${event.taskTitle}" a été remontée au niveau 1 (deadline dans ${event.daysLeft} jours).`,
          payload: event as unknown as Record<string, unknown>,
        },
        getMainWindow,
      )
      return
    case 'task-forced-three':
      sendNativeNotification(
        {
          title: 'Tâche urgente forcée au niveau 3',
          body: `"${event.taskTitle}" est due dans moins d'un jour. Nexus l'a forcée au niveau 3.`,
          payload: event as unknown as Record<string, unknown>,
        },
        getMainWindow,
      )
      return
    case 'task-degraded':
      sendNativeNotification(
        {
          title: 'Tâche dégradée',
          body: `"${event.taskTitle}" est passée au niveau ${event.newLevel}.`,
          payload: event as unknown as Record<string, unknown>,
        },
        getMainWindow,
      )
      return
    case 'task-urgent':
      notifyTaskUrgent(event.taskTitle, event.daysLeft, getMainWindow)
      return
  }
}
