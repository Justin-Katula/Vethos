/**
 * load-heatmap.ts
 *
 * Couleur d'un jour dans la carte de charge (vue Mois). Échelle relative sur
 * les jours rendus : le jour avec le plus de temps libre restant = vert, le
 * moins = rouge ; dégradé vert → lime → jaune → orange → rouge. Réf. spec §8.3.
 */

const GREEN = '#22c55e' // emerald-500
const RED = '#ef4444' // red-500

const GRADIENT: Array<{ stop: number; color: string }> = [
  { stop: 0.0, color: GREEN }, // peu chargé
  { stop: 0.25, color: '#84cc16' }, // lime-500
  { stop: 0.5, color: '#eab308' }, // yellow-500
  { stop: 0.75, color: '#f97316' }, // orange-500
  { stop: 1.0, color: RED }, // très chargé
]

/**
 * Couleur d'un jour selon son temps libre restant, relatif au min/max des
 * jours rendus. `freeMinutes` = ce jour ; `minFree`/`maxFree` = bornes des
 * autres jours rendus. Plus de temps libre → plus vert ; moins → plus rouge.
 */
export function loadColor(freeMinutes: number, minFree: number, maxFree: number): string {
  if (maxFree <= minFree) return GREEN
  const ratio = (freeMinutes - minFree) / (maxFree - minFree)
  const t = Math.max(0, Math.min(1, 1 - ratio)) // 0 = max free (vert), 1 = min free (rouge)
  return interpolateGradient(t)
}

function interpolateGradient(t: number): string {
  for (let i = 0; i < GRADIENT.length - 1; i++) {
    const a = GRADIENT[i]!
    const b = GRADIENT[i + 1]!
    if (t >= a.stop && t <= b.stop) {
      const localT = b.stop === a.stop ? 0 : (t - a.stop) / (b.stop - a.stop)
      return interpolateHex(a.color, b.color, localT)
    }
  }
  return GRADIENT[GRADIENT.length - 1]!.color
}

function interpolateHex(c1: string, c2: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(c1)
  const [r2, g2, b2] = hexToRgb(c2)
  const r = Math.round(r1 + (r2 - r1) * t)
  const g = Math.round(g1 + (g2 - g1) * t)
  const b = Math.round(b1 + (b2 - b1) * t)
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}

function toHex(n: number): string {
  return n.toString(16).padStart(2, '0')
}
