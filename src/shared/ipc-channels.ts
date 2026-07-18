export const IPC_CHANNELS = {
  STORAGE_READ: 'storage:read',
  STORAGE_WRITE: 'storage:write',
  STORAGE_EXISTS: 'storage:exists',
  APP_GET_VERSION: 'app:getVersion',
  APP_OPEN_LOGS: 'app:openLogs',
  APP_FLUSH_DEBOUNCES: 'app:flushDebounces',
  APP_DISCOVERY_LIST: 'app:discoverInstalledApps',
  UPDATER_EVENT_AVAILABLE: 'updater:event:available',
  UPDATER_EVENT_DOWNLOADED: 'updater:event:downloaded',
  // App usage tracker
  APP_USAGE_GET: 'appUsage:get',
  APP_USAGE_EVENT_TICK: 'appUsage:event:tick',
  // Tasks (renderer → main : déclencher notification native)
  TASKS_NOTIFY: 'tasks:notify',
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
