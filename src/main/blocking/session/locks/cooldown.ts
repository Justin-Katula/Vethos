export function remainingMs(startedAtIso: string, minutes: number, nowMs: number): number {
  const startMs = Date.parse(startedAtIso)
  const target = startMs + minutes * 60 * 1000
  return Math.max(0, target - nowMs)
}

export function isCooldownReady(startedAtIso: string, minutes: number, nowMs: number): boolean {
  return remainingMs(startedAtIso, minutes, nowMs) === 0
}
