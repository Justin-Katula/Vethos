import { performance } from 'node:perf_hooks'
import log from '../engine-log'

export type ClockTamperEvent = {
  driftMs: number
  wallDeltaMs: number
  monoDeltaMs: number
}

export type ClockMonitorHandle = {
  stop: () => void
}

export function startClockMonitor(
  onTamper: (event: ClockTamperEvent) => void,
  intervalMs = 10_000,
  thresholdMs = 5_000,
): ClockMonitorHandle {
  let lastWall = Date.now()
  let lastMono = performance.now()
  let lastTamperAt = 0

  const id = setInterval(() => {
    const wallNow = Date.now()
    const monoNow = performance.now()
    const wallDelta = wallNow - lastWall
    const monoDelta = monoNow - lastMono
    const drift = Math.abs(wallDelta - monoDelta)

    if (drift > thresholdMs && wallNow - lastTamperAt > 60_000) {
      lastTamperAt = wallNow
      const event = { driftMs: drift, wallDeltaMs: wallDelta, monoDeltaMs: monoDelta }
      log.warn('CLOCK TAMPER detected', event)
      onTamper(event)
    }

    lastWall = wallNow
    lastMono = monoNow
  }, intervalMs)

  return {
    stop: () => clearInterval(id),
  }
}
