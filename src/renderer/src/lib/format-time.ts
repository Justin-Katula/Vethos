/** 0 -> '0h00', 90 -> '1h30', 1439+ -> '23h59'. */
export function minuteToClockLabel(m: number): string {
  const clamped = Math.max(0, Math.min(1439, Math.round(m)))
  const h = Math.floor(clamped / 60)
  const mm = clamped % 60
  return `${h}h${String(mm).padStart(2, '0')}`
}

/** 30 → '30min', 60 → '1h', 90 → '1h30'. */
export function durationLabel(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  if (m < 60) return `${m}min`
  const h = Math.floor(m / 60)
  const rem = m % 60
  if (rem === 0) return `${h}h`
  return `${h}h${String(rem).padStart(2, '0')}`
}

/** Compte à rebours sans format horaire à deux-points. Plafond bas à 0. */
export function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) {
    return `${h}h${String(m).padStart(2, '0')}min${String(s).padStart(2, '0')}s`
  }
  if (m > 0) return `${m}min${String(s).padStart(2, '0')}s`
  return `${s}s`
}
