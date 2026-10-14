/**
 * Où une nouvelle ancre peut se poser. Une ancre ne bouge jamais : deux ancres
 * ne peuvent donc pas partager une minute, un même jour.
 *
 * - Une heure est GRISE quand elle est prise les sept jours : plus aucun jour
 *   ne peut l'accueillir.
 * - Sinon l'heure reste choisissable, et ce sont les JOURS déjà pris à cette
 *   heure-là qui se marquent.
 * - Deux ancres bout à bout (moins de 5 min entre elles) ne sont pas un
 *   conflit : on demande s'il faut une pause entre elles.
 */
import { PAUSE_ENTRE_TRAVAUX } from '@shared/planning/rest'

export type AncrePosee = { id: string; nom: string; minuteAncrage: number; dureeMinutes: number; jours: number[] }

const chevauche = (a: AncrePosee, debut: number, duree: number) =>
  debut < a.minuteAncrage + a.dureeMinutes && a.minuteAncrage < debut + duree

/** Les jours (convention du magasin, 0 = dimanche) où [debut, debut + duree) est déjà pris. */
export function joursPris(ancres: readonly AncrePosee[], debut: number, duree: number): number[] {
  const pris = new Set<number>()
  for (const a of ancres) if (chevauche(a, debut, Math.max(1, duree))) for (const j of a.jours) pris.add(j)
  return [...pris].sort((x, y) => x - y)
}

/** L'heure est prise tous les jours : rien ne peut s'y poser. */
export function heurePrise(ancres: readonly AncrePosee[], debut: number, duree: number): boolean {
  return joursPris(ancres, debut, duree).length === 7
}

export type Voisine = { ancre: AncrePosee; sens: 'apres' | 'avant'; ecart: number }

/**
 * Une ancre déjà posée, sur un jour commun, qui touche la nouvelle à moins de
 * 5 min : `apres` = la nouvelle la suit, `avant` = la nouvelle la précède.
 */
export function ancreCollee(ancres: readonly AncrePosee[], debut: number, duree: number, jours: readonly number[]): Voisine | null {
  const fin = debut + duree
  for (const a of ancres) {
    if (!a.jours.some((j) => jours.includes(j))) continue
    const finA = a.minuteAncrage + a.dureeMinutes
    if (debut >= finA && debut - finA < PAUSE_ENTRE_TRAVAUX) return { ancre: a, sens: 'apres', ecart: debut - finA }
    if (a.minuteAncrage >= fin && a.minuteAncrage - fin < PAUSE_ENTRE_TRAVAUX) return { ancre: a, sens: 'avant', ecart: a.minuteAncrage - fin }
  }
  return null
}

/** Le début qui laisse 5 min de pause avec la voisine (la nouvelle ancre glisse, jamais l'ancienne). */
export function debutAvecPause(debut: number, v: Voisine): number {
  const manque = PAUSE_ENTRE_TRAVAUX - v.ecart
  return v.sens === 'apres' ? debut + manque : debut - manque
}
