export const IPC_CHANNELS = {
  STORAGE_READ: 'storage:read',
  STORAGE_WRITE: 'storage:write',
  STORAGE_EXISTS: 'storage:exists',
  APP_GET_VERSION: 'app:getVersion',
  AUTH_SET_USER_ID: 'auth:setUserId',
  APP_OPEN_LOGS: 'app:openLogs',
  APP_FLUSH_DEBOUNCES: 'app:flushDebounces',
  APP_DISCOVERY_LIST: 'app:discoverInstalledApps',
  UPDATER_CHECK_NOW: 'updater:checkNow',
  UPDATER_EVENT_AVAILABLE: 'updater:event:available',
  UPDATER_EVENT_DOWNLOADED: 'updater:event:downloaded',
  // Blocking — invoke
  BLOCKING_GET_INITIAL_STATE: 'blocking:getInitialState',
  BLOCKING_SAVE_PROFILE: 'blocking:saveProfile',
  BLOCKING_DELETE_PROFILE: 'blocking:deleteProfile',
  BLOCKING_START_SESSION: 'blocking:startSession',
  BLOCKING_START_TEST: 'blocking:startTest',
  BLOCKING_REQUEST_UNLOCK: 'blocking:requestUnlock',
  BLOCKING_SUBMIT_JUSTIFICATION: 'blocking:submitJustification',
  BLOCKING_SUBMIT_APP_EXPLANATION: 'blocking:submitAppExplanation',
  BLOCKING_MINIMIZE_APP_WINDOW: 'blocking:minimizeAppWindow',
  BLOCKING_CLOSE_APP_WINDOW: 'blocking:closeAppWindow',
  BLOCKING_GET_LAYER_STATUS: 'blocking:getLayerStatus',
  BLOCKING_GET_SERVICE_STATUS: 'blocking:getServiceStatus',
  BLOCKING_REPAIR_SERVICE: 'blocking:repairService',
  // Blocking — events main → renderer
  BLOCKING_EVENT_SERVICE_STATUS: 'blocking:event:serviceStatus',
  BLOCKING_EVENT_SESSION_CHANGED: 'blocking:event:sessionChanged',
  BLOCKING_EVENT_LAYER_DRIFT: 'blocking:event:layerDrift',
  BLOCKING_EVENT_CLOCK_TAMPER: 'blocking:event:clockTamper',
  BLOCKING_EVENT_BREAK_REQUIRED: 'blocking:event:breakRequired',
  BLOCKING_EVENT_BLOCKED_ATTEMPT: 'blocking:event:blockedAttempt',
  // App usage tracker
  APP_USAGE_GET: 'appUsage:get',
  APP_USAGE_EVENT_TICK: 'appUsage:event:tick',
  // Registry auto-discovery event
  REGISTRY_EVENT_ITEM_OBSERVED: 'registry:event:itemObserved',
  // DeepSeek (renderer -> main, API key never leaves main process)
  DEEPSEEK_CHAT: 'deepseek:chat',
  // Tasks (renderer → main : déclencher notification native)
  TASKS_NOTIFY: 'tasks:notify',
  // Coach IA
  COACH_ANALYZE_TASK: 'coach:analyzeTask',
  COACH_GENERATE_SUBTASKS: 'coach:generateSubtasks',
  COACH_CATEGORIZE_APPS: 'coach:categorizeApps',
  COACH_CLASSIFY_APPS_FOR_TASK: 'coach:classifyAppsForTask',
  COACH_CLASSIFY_APPS_FOR_OBJECTIVE: 'coach:classifyAppsForObjective',
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
