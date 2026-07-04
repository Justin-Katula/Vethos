import type { DeclaredApp, DeclaredAppUsageEntry, DeclaredAppUsageState } from '@shared/schemas'
import log from '@main/logging/setup'

const RETENTION_DAYS = 90
const DEFAULT_TICK_MS = 60_000
const DEFAULT_FLUSH_MS = 30_000
const tlog = log.scope('app-usage-tracker')

export type TrackerStorage = {
  read: () => Promise<DeclaredAppUsageState | null>
  write: (state: DeclaredAppUsageState) => Promise<void>
}

export type TrackerDeps = {
  storage: TrackerStorage
  getDeclaredApps: () => Promise<DeclaredApp[]>
  listProcesses: () => Promise<{ name: string; pid: number }[]>
  /** Source de "maintenant" — injectable pour les tests. */
  now?: () => Date
  /** Source de la date locale YYYY-MM-DD — injectable pour les tests. */
  localDate?: () => string
  /** Callback invoqué après chaque flush avec l'état persisté. */
  onFlush?: (state: DeclaredAppUsageState) => void
}

function todayLocal(now: Date): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number) as [number, number, number]
  const [by, bm, bd] = b.split('-').map(Number) as [number, number, number]
  const da = Date.UTC(ay, am - 1, ad)
  const db = Date.UTC(by, bm - 1, bd)
  return Math.round((db - da) / 86_400_000)
}

function entryKey(appId: string, date: string): string {
  return `${appId}|${date}`
}

type ActivityEvent = NonNullable<DeclaredAppUsageState['activityEvents']>[number]

export function activityMinutesBetween(
  state: DeclaredAppUsageState | null | undefined,
  startAt: Date,
  endAt: Date,
  kinds: ActivityEvent['kind'][],
): number {
  const startMs = startAt.getTime()
  const endMs = endAt.getTime()
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0

  const allowedKinds = new Set(kinds)
  const minuteBuckets = new Set<number>()
  for (const event of state?.activityEvents ?? []) {
    if (!allowedKinds.has(event.kind)) continue
    const atMs = Date.parse(event.at)
    if (!Number.isFinite(atMs) || atMs < startMs || atMs >= endMs) continue
    minuteBuckets.add(Math.floor((atMs - startMs) / 60_000))
  }
  return minuteBuckets.size
}

export function distractingActivityMinutesBetween(
  state: DeclaredAppUsageState | null | undefined,
  startAt: Date,
  endAt: Date,
): number {
  return activityMinutesBetween(state, startAt, endAt, ['distracting-app-active'])
}

export type Tracker = {
  hydrate: () => Promise<void>
  tick: () => Promise<void>
  flushNow: () => Promise<void>
  clear: () => void
  recordActivityEvent: (event: NonNullable<DeclaredAppUsageState['activityEvents']>[number]) => void
  start: (intervalMs?: number, flushMs?: number) => void
  stop: () => void
  getState: () => DeclaredAppUsageState
}

export function createTracker(deps: TrackerDeps): Tracker {
  const now = deps.now ?? ((): Date => new Date())
  const localDate = deps.localDate ?? ((): string => todayLocal(now()))

  // Buffer en mémoire keyed par "appId|date"
  const buffer = new Map<string, number>()
  let activityEvents: NonNullable<DeclaredAppUsageState['activityEvents']> = []
  let lastTickAt: string | null = null
  let dirty = false

  let tickHandle: NodeJS.Timeout | null = null
  let flushHandle: NodeJS.Timeout | null = null

  function bufferToEntries(): DeclaredAppUsageEntry[] {
    const out: DeclaredAppUsageEntry[] = []
    for (const [key, minutes] of buffer.entries()) {
      const sep = key.indexOf('|')
      const appId = key.slice(0, sep)
      const date = key.slice(sep + 1)
      out.push({ appId, date, minutes })
    }
    return out
  }

  function pruneOld(today: string): void {
    for (const key of [...buffer.keys()]) {
      const sep = key.indexOf('|')
      const date = key.slice(sep + 1)
      if (daysBetween(date, today) > RETENTION_DAYS) {
        buffer.delete(key)
        dirty = true
      }
    }
  }

  async function hydrate(): Promise<void> {
    const state = await deps.storage.read()
    if (!state) return
    buffer.clear()
    for (const e of state.entries) {
      buffer.set(entryKey(e.appId, e.date), e.minutes)
    }
    activityEvents = (state.activityEvents ?? []).slice(-2000)
    lastTickAt = state.lastTickAt
    dirty = false
  }

  async function tick(): Promise<void> {
    try {
      const apps = await deps.getDeclaredApps()
      if (apps.length === 0) {
        lastTickAt = now().toISOString()
        return
      }
      const procs = await deps.listProcesses()
      const procNames = new Set(procs.map((p) => p.name.toLowerCase()))
      const today = localDate()

      pruneOld(today)

      for (const app of apps) {
        if (app.exeName && procNames.has(app.exeName.toLowerCase())) {
          const key = entryKey(app.id, today)
          buffer.set(key, (buffer.get(key) ?? 0) + 1)
          activityEvents.push({
            at: now().toISOString(),
            kind: 'declared-app-active',
            label: app.name,
            appId: app.id,
          })
          if (activityEvents.length > 2000) {
            activityEvents = activityEvents.slice(-2000)
          }
          dirty = true
        }
      }
      lastTickAt = now().toISOString()
    } catch (err) {
      tlog.error('tick error caught inside function', err)
    }
  }

  async function flushNow(): Promise<void> {
    try {
      if (!dirty) return
      const state: DeclaredAppUsageState = {
        entries: bufferToEntries().sort((a, b) => {
          if (a.date !== b.date) return a.date.localeCompare(b.date)
          return a.appId.localeCompare(b.appId)
        }),
        lastTickAt,
        activityEvents,
      }
      await deps.storage.write(state)
      dirty = false
      deps.onFlush?.(state)
    } catch (err) {
      tlog.error('flushNow error caught inside function', err)
    }
  }

  function recordActivityEvent(
    event: NonNullable<DeclaredAppUsageState['activityEvents']>[number],
  ): void {
    activityEvents.push(event)
    if (activityEvents.length > 2000) activityEvents = activityEvents.slice(-2000)
    dirty = true
  }

  function clear(): void {
    buffer.clear()
    activityEvents = []
    lastTickAt = null
    dirty = false
  }

  function start(intervalMs = DEFAULT_TICK_MS, flushMs = DEFAULT_FLUSH_MS): void {
    if (tickHandle || flushHandle) stop()
    tickHandle = setInterval(() => {
      tick().catch((err) => tlog.error('tick failed', err))
    }, intervalMs)
    flushHandle = setInterval(() => {
      flushNow().catch((err) => tlog.error('flush failed', err))
    }, flushMs)
  }

  function stop(): void {
    if (tickHandle) {
      clearInterval(tickHandle)
      tickHandle = null
    }
    if (flushHandle) {
      clearInterval(flushHandle)
      flushHandle = null
    }
  }

  function getState(): DeclaredAppUsageState {
    return {
      entries: bufferToEntries(),
      lastTickAt,
      activityEvents,
    }
  }

  return { hydrate, tick, flushNow, clear, recordActivityEvent, start, stop, getState }
}
