/**
 * Protocole JSONL entre le processus principal et le sidecar natif.
 *
 * Une ligne = un message. Les commandes portent un `id` numérique ; le sidecar
 * répond avec le même `id`. Les événements n'ont pas d'`id`, ils portent
 * `event`.
 *
 * `hwnd` et `processCreatedAt` circulent en chaînes décimales : ce sont des
 * valeurs 64 bits qui dépassent la précision entière de JavaScript.
 */

export type SidecarCommand =
  | { id: number; cmd: 'ping' }
  | { id: number; cmd: 'shutdown' }
  | { id: number; cmd: 'snapshot' }
  | { id: number; cmd: 'watch'; exeNames: string[] }
  | { id: number; cmd: 'release'; hwnd: string }
  | { id: number; cmd: 'release-all' }
  | { id: number; cmd: 'arm-relaunch'; exePath: string | null }

export type SidecarReply = {
  kind: 'reply'
  id: number
  ok: boolean
  payload?: Record<string, unknown>
  error?: string
}

export type SidecarEvent = {
  kind: 'event'
  event: string
  payload: Record<string, unknown>
}

export type SidecarMessage = SidecarReply | SidecarEvent

/**
 * `Omit` ne distribue PAS sur une union : `keyof (A | B)` ne renvoie que les
 * clés communes, donc `Omit<SidecarCommand, 'id'>` réduirait le type à
 * `{ cmd: ... }` en perdant `exeNames`, `hwnd` et `exePath`. Cette version
 * distribue explicitement sur chaque membre de l'union.
 */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

/** Une commande sans son `id` — le pont attribue l'identifiant. */
export type SidecarRequest = DistributiveOmit<SidecarCommand, 'id'>

export function encodeCommand(cmd: SidecarCommand): string {
  return JSON.stringify(cmd)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function decodeLine(line: string): SidecarMessage | null {
  const trimmed = line.trim()
  if (trimmed.length === 0) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return null
  }
  if (!isPlainObject(parsed)) return null

  const eventName = parsed['event']
  if (typeof eventName === 'string') {
    const payload: Record<string, unknown> = { ...parsed }
    delete payload['event']
    return { kind: 'event', event: eventName, payload }
  }

  const id = parsed['id']
  const ok = parsed['ok']
  if (typeof id === 'number' && typeof ok === 'boolean') {
    if (!ok) {
      const error = parsed['error']
      return { kind: 'reply', id, ok: false, error: typeof error === 'string' ? error : 'erreur inconnue' }
    }
    const payload: Record<string, unknown> = { ...parsed }
    delete payload['id']
    delete payload['ok']
    return { kind: 'reply', id, ok: true, payload }
  }

  return null
}
