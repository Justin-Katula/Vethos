import { parseHHMM } from '@shared/sleep'

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

export type BornesCarte = {
  debut: number
  fin: number
  debutHeure: number
  finHeure: number
}

/**
 * Calcule les bornes d'affichage de la carte hebdomadaire à partir du lever et du coucher.
 * Arrondi à l'heure inférieure pour le début et supérieure pour la fin.
 */
export function calculerBornesCarte(lever?: string, coucher?: string): BornesCarte {
  const leverMin = parseHHMM(lever) ?? 7 * 60
  const coucherMin = parseHHMM(coucher) ?? 23 * 60

  let debutHeure = Math.floor(leverMin / 60)
  // Si le coucher est après minuit (ex: 00:30) ou inférieur au lever, on termine à 24h
  let finHeure = coucherMin <= leverMin ? 24 : Math.ceil(coucherMin / 60)

  // Garder au moins 6 heures visibles pour une carte lisible
  if (finHeure - debutHeure < 6) {
    if (debutHeure > 18) debutHeure = 18
    finHeure = Math.min(24, Math.max(finHeure, debutHeure + 6))
  }

  debutHeure = Math.max(0, Math.min(23, debutHeure))
  finHeure = Math.max(debutHeure + 1, Math.min(24, finHeure))

  return {
    debut: debutHeure * 60,
    fin: finHeure * 60,
    debutHeure,
    finHeure,
  }
}

/**
 * Génère les repères horaires avec un pas régulier (par défaut 2h).
 */
export function heuresPaliers(debutHeure: number, finHeure: number, pas = 2): number[] {
  const heures: number[] = []
  for (let h = debutHeure; h <= finHeure; h += pas) {
    heures.push(h)
  }
  return heures
}
