export const IPC_CHANNELS = {
  STORAGE_READ: 'storage:read',
  STORAGE_WRITE: 'storage:write',
  STORAGE_EXISTS: 'storage:exists',
  APP_GET_VERSION: 'app:getVersion',
  APP_OPEN_LOGS: 'app:openLogs',
  APP_FLUSH_DEBOUNCES: 'app:flushDebounces',
  /** Heures de sommeil : le main les connaît pour ne jamais notifier dedans. */
  APP_SET_SLEEP_WINDOW: 'app:setSleepWindow',
  /**
   * Thème résolu (`light` / `dark`). Le CSS ne peut pas repeindre le cadre
   * natif : fond de fenêtre et boutons de la barre de titre appartiennent au
   * main. Sans ce canal, passer en sombre laisse une barre système claire
   * collée en haut d'une application noire.
   */
  APP_SET_THEME: 'app:setTheme',
  APP_DISCOVERY_LIST: 'app:discoverInstalledApps',
  /** Relance un scan complet. Ne rappelle jamais l'IA pour ce qui est déjà jugé. */
  APP_DISCOVERY_REFRESH: 'app:refreshInstalledApps',
  /** Événement émis lors de la mise à jour / réconciliation du catalogue en direct. */
  APP_EVENT_CATALOG_UPDATED: 'app:event:catalogUpdated',
  /** Permet à l'utilisateur de changer manuellement la catégorie d'une application (autorité maximale). */
  APP_SET_USER_OVERRIDE: 'app:setUserOverride',
  /** Réinitialise la catégorie vers sa résolution automatique. */
  APP_RESET_USER_OVERRIDE: 'app:resetUserOverride',
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
  // D.7/D.8 — confirmation « Je commence » d'un bloc du planning.
  PLANNING_CONFIRM_BLOCK: 'planning:confirmBlock',
  PLANNING_STOP_BLOCK: 'planning:stopBlock',
  PLANNING_EXTENSION: 'planning:extension',
  PLANNING_FREE_DAY: 'planning:freeDay',
  // Poussé par l'horloge de planification (main) chaque fois qu'elle écrit du
  // retard, un raté, ou une confirmation — le renderer n'a sinon aucun moyen
  // de savoir que ce qu'il affiche est devenu périmé sans rouvrir l'app.
  PLANNING_EVENT_CHANGED: 'planning:event:changed',
  // Blocage intelligent par IA
  INTELLIGENT_BLOCKING_DECIDE: 'blocking:intelligent:decide',
  INTELLIGENT_BLOCKING_REVIEW_REQUEST: 'blocking:intelligent:reviewRequest',
  INTELLIGENT_BLOCKING_GET_KNOWLEDGE: 'blocking:intelligent:getKnowledge',
  INTELLIGENT_BLOCKING_STREAM_PROGRESS: 'blocking:intelligent:streamProgress',
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
