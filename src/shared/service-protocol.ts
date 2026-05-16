/** Chemin du named pipe UI <-> Service. */
export const PIPE_PATH = '\\\\.\\pipe\\NexusServiceBridge'

export type ServiceRequest = {
  kind: 'request'
  id: string
  type: string
  payload?: unknown
}

export type ServiceResponse =
  | { kind: 'response'; id: string; ok: true; data?: unknown }
  | { kind: 'response'; id: string; ok: false; error: string }

export type ServiceEvent = {
  kind: 'event'
  type: string
  payload?: unknown
}

export type ServiceMessage = ServiceRequest | ServiceResponse | ServiceEvent

/** Renvoie l'info diagnostique du service (réponse de GET_SERVICE_INFO). */
export type ServiceInfo = {
  version: string
  pid: number
  uptimeMs: number
}

/**
 * Types de requêtes UI → Service. Phase 1 : PING, GET_SERVICE_INFO.
 * Lot 3+ : commandes de blocage. L'enveloppe `ServiceRequest.type` reste un
 * `string` générique ; ce type sert à typer la table de handlers du service.
 */
export type ServiceRequestType =
  | 'PING'
  | 'GET_SERVICE_INFO'
  | 'GET_STATE'
  | 'SAVE_PROFILE'
  | 'DELETE_PROFILE'
  | 'START_SESSION'
  | 'REQUEST_UNLOCK'
  | 'SUBMIT_JUSTIFICATION'
  | 'GET_LAYER_STATUS'

/**
 * Types d'événements poussés Service → UI (Lot 3+). L'UI les re-transmet au
 * renderer sur les canaux IPC `BLOCKING_EVENT_*` existants.
 */
export type ServiceEventType =
  | 'SESSION_CHANGED'
  | 'SESSION_ENDED'
  | 'LAYER_DRIFT'
  | 'CLOCK_TAMPER'
  | 'BREAK_REQUIRED'

/** Sérialise un message en ligne JSON terminée par `\n`. */
export function encodeMessage(msg: ServiceMessage): string {
  return JSON.stringify(msg) + '\n'
}

/**
 * Crée un décodeur à état : accumule les chunks reçus du socket et renvoie les
 * messages complets (délimités par `\n`). Les chunks partiels sont bufferisés.
 */
export function createMessageDecoder(): (chunk: string) => ServiceMessage[] {
  let buffer = ''
  return (chunk: string): ServiceMessage[] => {
    buffer += chunk
    const messages: ServiceMessage[] = []
    let nl = buffer.indexOf('\n')
    while (nl !== -1) {
      const line = buffer.slice(0, nl)
      buffer = buffer.slice(nl + 1)
      if (line.trim() !== '') messages.push(JSON.parse(line) as ServiceMessage)
      nl = buffer.indexOf('\n')
    }
    return messages
  }
}
