export const IPC_CHANNELS = {
  STORAGE_READ: 'storage:read',
  STORAGE_WRITE: 'storage:write',
  STORAGE_EXISTS: 'storage:exists',
  APP_GET_VERSION: 'app:getVersion',
  APP_OPEN_LOGS: 'app:openLogs',
  APP_FLUSH_DEBOUNCES: 'app:flushDebounces',
  /** Heures de sommeil : le main les connaît pour ne jamais notifier dedans. */
  APP_SET_SLEEP_WINDOW: 'app:setSleepWindow',
  APP_DISCOVERY_LIST: 'app:discoverInstalledApps',
  /** Relance un scan complet. Ne rappelle jamais l'IA pour ce qui est déjà jugé. */
  APP_DISCOVERY_REFRESH: 'app:refreshInstalledApps',
  UPDATER_EVENT_AVAILABLE: 'updater:event:available',
  UPDATER_EVENT_DOWNLOADED: 'updater:event:downloaded',
  // App usage tracker
  APP_USAGE_GET: 'appUsage:get',
  APP_USAGE_EVENT_TICK: 'appUsage:event:tick',
  // Blocage — les règles passent par les canaux de stockage génériques avec la
  // clé `blocking_rules`. Seul l'état de session a besoin de son propre canal :
  // il est décidé par l'horloge du processus principal, pas par l'interface.
  BLOCKING_GET_SESSION: 'blocking:getSession',
  // Boutons de l'overlay : minimiser ou fermer la PAIRE overlay + fenetre cible.
  BLOCKING_MINIMIZE_APP_WINDOW: 'blocking:minimizeAppWindow',
  BLOCKING_CLOSE_APP_WINDOW: 'blocking:closeAppWindow',
  BLOCKING_EVENT_SESSION: 'blocking:event:session',
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
