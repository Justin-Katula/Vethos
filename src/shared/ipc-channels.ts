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
  // Blocking — invoke
  BLOCKING_GET_INITIAL_STATE: 'blocking:getInitialState',
  BLOCKING_SAVE_PROFILE: 'blocking:saveProfile',
  BLOCKING_DELETE_PROFILE: 'blocking:deleteProfile',
  BLOCKING_START_SESSION: 'blocking:startSession',
  BLOCKING_REQUEST_UNLOCK: 'blocking:requestUnlock',
  BLOCKING_SUBMIT_JUSTIFICATION: 'blocking:submitJustification',
  BLOCKING_GET_LAYER_STATUS: 'blocking:getLayerStatus',
  BLOCKING_GET_SERVICE_STATUS: 'blocking:getServiceStatus',
  BLOCKING_REPAIR_SERVICE: 'blocking:repairService',
  // Blocking — events main → renderer
  BLOCKING_EVENT_SERVICE_STATUS: 'blocking:event:serviceStatus',
  BLOCKING_EVENT_SESSION_CHANGED: 'blocking:event:sessionChanged',
  BLOCKING_EVENT_LAYER_DRIFT: 'blocking:event:layerDrift',
  BLOCKING_EVENT_CLOCK_TAMPER: 'blocking:event:clockTamper',
  BLOCKING_EVENT_BREAK_REQUIRED: 'blocking:event:breakRequired',
  // App usage tracker
  APP_USAGE_GET: 'appUsage:get',
  APP_USAGE_EVENT_TICK: 'appUsage:event:tick',
  // Tasks (renderer → main : déclencher notification native)
  TASKS_NOTIFY: 'tasks:notify',
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
