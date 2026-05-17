import type { ActiveSession } from '@shared/schemas'
import log from '../engine-log'

export function monotonicNowMs(): number {
  return Number(process.hrtime.bigint() / 1_000_000n)
}

function durationMs(session: ActiveSession): number {
  if (session.durationMinutes) return session.durationMinutes * 60_000
  return Math.max(0, Date.parse(session.endsAt) - Date.parse(session.startedAt))
}

export function remainingSessionMs(
  session: ActiveSession,
  nowWallMs = Date.now(),
  nowMonoMs = monotonicNowMs(),
): number {
  const total = durationMs(session)
  if (
    typeof session.startedAtMono === 'number' &&
    session.startedAtMono > 0 &&
    nowMonoMs >= session.startedAtMono
  ) {
    return Math.max(0, total - (nowMonoMs - session.startedAtMono))
  }

  const startedWall = session.startedAtWall ?? Date.parse(session.startedAt)
  const wallElapsed = nowWallMs - startedWall
  if (wallElapsed > total + 60_000) {
    log.warn('suspicious clock jump while calculating session timer', {
      sessionId: session.id,
      wallElapsed,
      durationMs: total,
    })
  }
  return Math.max(0, total - wallElapsed)
}
