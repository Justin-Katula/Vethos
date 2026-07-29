import type { ShowState } from './geometry'

/**
 * Journal de restauration écrit sur disque avant chaque mutation de fenêtre.
 *
 * Troisième garantie du §5 de la spec, celle qui couvre la mort simultanée de
 * Vethos et du sidecar — coupure de courant, arrêt de l'arborescence depuis le
 * Gestionnaire des tâches. Au démarrage suivant, Vethos rejoue ce journal.
 *
 * C'est la réponse de fond aux bugs 1 et 2 : plus aucune fenêtre ne peut
 * rester piégée, quel que soit le mode d'arrêt.
 *
 * L'appariement se fait sur `(pid, processCreatedAt)` : Windows réutilise les
 * PID, et restaurer sur un simple PID toucherait un processus étranger.
 */

export type JournalEntry = {
  hwnd: string
  pid: number
  exeName: string
  processCreatedAt: string
  taskbarWasVisible: boolean
  originalShowState: ShowState
  audioWasMuted: boolean
}

export type Journal = {
  version: 1
  sessionStartedAt: string
  entries: JournalEntry[]
}

export type LiveProcess = { pid: number; processCreatedAt: string }

const SHOW_STATES: readonly ShowState[] = ['normal', 'minimized', 'maximized']

export function emptyJournal(sessionStartedAt: string): Journal {
  return { version: 1, sessionStartedAt, entries: [] }
}

export function encodeJournal(journal: Journal): string {
  return JSON.stringify(journal)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseEntry(raw: unknown): JournalEntry | null {
  if (!isRecord(raw)) return null
  const { hwnd, pid, exeName, processCreatedAt, taskbarWasVisible, originalShowState, audioWasMuted } =
    raw
  if (typeof hwnd !== 'string' || hwnd.length === 0) return null
  if (typeof pid !== 'number' || !Number.isFinite(pid)) return null
  if (typeof exeName !== 'string') return null
  if (typeof processCreatedAt !== 'string') return null
  if (typeof taskbarWasVisible !== 'boolean') return null
  if (typeof audioWasMuted !== 'boolean') return null
  if (typeof originalShowState !== 'string') return null
  if (!SHOW_STATES.includes(originalShowState as ShowState)) return null
  return {
    hwnd,
    pid,
    exeName,
    processCreatedAt,
    taskbarWasVisible,
    originalShowState: originalShowState as ShowState,
    audioWasMuted,
  }
}

/** Renvoie `null` si le journal est illisible ou d'une version inconnue. */
export function decodeJournal(raw: string): Journal | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(parsed)) return null
  if (parsed['version'] !== 1) return null
  const sessionStartedAt = parsed['sessionStartedAt']
  if (typeof sessionStartedAt !== 'string') return null
  const rawEntries = parsed['entries']
  if (!Array.isArray(rawEntries)) return null

  const entries: JournalEntry[] = []
  for (const candidate of rawEntries) {
    const entry = parseEntry(candidate)
    // Une entree corrompue est ecartee ; le reste du journal reste exploitable.
    if (entry !== null) entries.push(entry)
  }
  return { version: 1, sessionStartedAt, entries }
}

/** La première capture fait foi : réécrire mémoriserait un état déjà modifié. */
export function upsertEntry(journal: Journal, entry: JournalEntry): Journal {
  if (journal.entries.some((existing) => existing.hwnd === entry.hwnd)) return journal
  return { ...journal, entries: [...journal.entries, entry] }
}

export function removeEntry(journal: Journal, hwnd: string): Journal {
  return { ...journal, entries: journal.entries.filter((entry) => entry.hwnd !== hwnd) }
}

/** Entrées à restaurer : celles dont le processus d'origine tourne encore. */
export function planReplay(journal: Journal, alive: readonly LiveProcess[]): JournalEntry[] {
  const key = (pid: number, createdAt: string): string => `${pid}:${createdAt}`
  const liveKeys = new Set(alive.map((p) => key(p.pid, p.processCreatedAt)))
  return journal.entries.filter((entry) => liveKeys.has(key(entry.pid, entry.processCreatedAt)))
}
