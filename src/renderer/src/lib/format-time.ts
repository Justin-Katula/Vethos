/** 0 → '00:00', 90 → '01:30', 1439 → '23:59'. Plafond 1440 → '24:00' (utile pour limites). */
export function minuteToHHMM(m: number): string {
  const clamped = Math.max(0, Math.min(1440, Math.round(m)))
  const h = Math.floor(clamped / 60)
  const mm = clamped % 60
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

/** 30 → '30 min', 60 → '1h', 90 → '1h30'. */
export function durationLabel(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rem = m % 60
  if (rem === 0) return `${h}h`
  return `${h}h${String(rem).padStart(2, '0')}`
}

/** Compte à rebours `MM:SS` (ou `HH:MM:SS` si > 1h). Plafond bas à 0. */
export function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
