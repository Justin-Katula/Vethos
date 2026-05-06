export const IPC_CHANNELS = {
  STORAGE_READ: 'storage:read',
  STORAGE_WRITE: 'storage:write',
  STORAGE_EXISTS: 'storage:exists',
  APP_GET_VERSION: 'app:getVersion',
  // Blocking — invoke
  BLOCKING_GET_INITIAL_STATE: 'blocking:getInitialState',
  BLOCKING_SAVE_PROFILE: 'blocking:saveProfile',
  BLOCKING_DELETE_PROFILE: 'blocking:deleteProfile',
  BLOCKING_START_SESSION: 'blocking:startSession',
  BLOCKING_REQUEST_UNLOCK: 'blocking:requestUnlock',
  BLOCKING_SUBMIT_JUSTIFICATION: 'blocking:submitJustification',
  BLOCKING_GET_LAYER_STATUS: 'blocking:getLayerStatus',
  BLOCKING_IS_ELEVATED: 'blocking:isElevated',
  // Blocking — events main → renderer
  BLOCKING_EVENT_SESSION_CHANGED: 'blocking:event:sessionChanged',
  BLOCKING_EVENT_LAYER_DRIFT: 'blocking:event:layerDrift',
  // App usage tracker
  APP_USAGE_GET: 'appUsage:get',
  APP_USAGE_EVENT_TICK: 'appUsage:event:tick',
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
