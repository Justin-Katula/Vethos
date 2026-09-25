import type { Jetons } from '@/theme/jetons'
import type { NatureTemps, SegmentTemps } from '@/plan/lecture'
import {
  COULEUR_ANCRE,
  COULEUR_ENCRE,
  COULEUR_OBJECTIF,
  COULEUR_TACHE,
  PALETTE_ANCRES,
  PALETTE_ENCRE,
  PALETTE_OBJECTIFS,
  PALETTE_TACHES,
  allouerCouleurAncre,
  allouerCouleurDisponible,
  allouerCouleurObjectif,
  allouerCouleurTache,
  assainirCouleur,
  couleurAncre,
  couleurElement,
  couleurEncre,
  couleurObjectif,
  couleurTache,
  estCouleurDansFamille,
  variantesType,
} from '@shared/palettes'

export {
  COULEUR_ANCRE,
  COULEUR_ENCRE,
  COULEUR_OBJECTIF,
  COULEUR_TACHE,
  PALETTE_ANCRES,
  PALETTE_ENCRE,
  PALETTE_OBJECTIFS,
  PALETTE_TACHES,
  allouerCouleurAncre,
  allouerCouleurDisponible,
  allouerCouleurObjectif,
  allouerCouleurTache,
  assainirCouleur,
  couleurAncre,
  couleurElement,
  couleurEncre,
  couleurObjectif,
  couleurTache,
  estCouleurDansFamille,
  variantesType,
}

/**
 * Couleur d'accent d'une nature d'engagement :
 * - Objectifs : argent (j.accentEncre)
 * - Tâches : famille gris (j.text2 / #bebebe)
 * - Ancres : famille bleu froid (j.blocAncre / #2c3a56)
 * - Fixes : j.text3
 */
export function couleurTemps(nature: NatureTemps, j: Jetons): string {
  if (nature === 'objective') return j.accentEncre
  if (nature === 'task') return j.text2
  if (nature === 'ancre') return j.blocAncre
  if (nature === 'fixed') return j.text3
  return j.text3
}

/**
 * Couleur d'un segment spécifique, en préférant sa variante dédiée si elle appartient bien à sa famille.
 * Un objectif ne peut JAMAIS hériter d'une couleur bleue ou étrangère.
 */
export function couleurSegment(
  segment: Pick<SegmentTemps, 'nature'> & { couleur?: string; bloc?: { color?: string } },
  j: Jetons,
): string {
  const candidate = segment.couleur || (segment.bloc?.color && segment.bloc.color !== '#E8E8E8' ? segment.bloc.color : undefined)
  if (segment.nature === 'objective' || segment.nature === 'task' || segment.nature === 'ancre') {
    if (candidate && estCouleurDansFamille(segment.nature, candidate)) {
      return candidate
    }
  } else if (candidate) {
    return candidate
  }
  return couleurTemps(segment.nature, j)
}

export function couleurFondBloc(nature: NatureTemps, j: Jetons): string {
  if (nature === 'objective') return j.blocObjectif
  if (nature === 'task') return j.blocTache
  if (nature === 'ancre') return j.blocAncre
  return j.surface2
}

export function couleurEncreBloc(nature: NatureTemps, j: Jetons): string {
  if (nature === 'objective') return j.blocEncreObjectif
  if (nature === 'task') return j.blocEncreTache
  if (nature === 'ancre') return j.blocEncreAncre
  return j.text
}

export const nomsTemps: Record<NatureTemps, string> = {
  sleep: 'Sleep',
  fixed: 'Fixed',
  task: 'Task',
  objective: 'Goal',
  ancre: 'Anchor',
}
