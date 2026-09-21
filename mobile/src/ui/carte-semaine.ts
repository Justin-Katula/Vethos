/** Projection pure des minutes d'une journée sur la hauteur de la carte. */

function borne(valeur: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, valeur))
}

export function positionMinute(
  minute: number,
  debut: number,
  fin: number,
  hauteur: number,
): number {
  return ((borne(minute, debut, fin) - debut) / Math.max(1, fin - debut)) * hauteur
}

export function projectionIntervalle(
  debutIntervalle: number,
  finIntervalle: number,
  debutCarte: number,
  finCarte: number,
  hauteur: number,
): { top: number; height: number } | null {
  const debutVisible = Math.max(debutIntervalle, debutCarte)
  const finVisible = Math.min(finIntervalle, finCarte)
  if (finVisible <= debutVisible) return null
  const top = positionMinute(debutVisible, debutCarte, finCarte, hauteur)
  const bas = positionMinute(finVisible, debutCarte, finCarte, hauteur)
  return { top, height: bas - top }
}
