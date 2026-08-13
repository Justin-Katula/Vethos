import type { ScheduleCategory } from '@shared/schemas'
import type { BlockKind } from '@/lib/planning/types'

/**
 * L'ÉMAIL DU HALL
 *
 * Un tableau de gare n'a qu'une encre et un rouge. Tout le reste se distingue
 * par la luminosité de l'émail : plus une bande est claire, plus le temps
 * qu'elle occupe t'appartient.
 *
 * Le rouge n'est pas ici. Il vit dans `--signal`, il dit « maintenant » et
 * « ça a changé », et il n'a le droit de dire rien d'autre.
 */

/** Ce qui est déjà pris. Le sommeil est presque le panneau lui-même. */
export const CATEGORY_COLOR: Record<ScheduleCategory, string> = {
  sleep: '#1A1D21',
  school: '#8C949D',
  work: '#727A83',
  commute: '#454C54',
  commitment: '#5B636C',
  custom: '#4E555D',
}

export const CATEGORY_LABEL: Record<ScheduleCategory, string> = {
  sleep: 'Sommeil',
  school: 'École',
  work: 'Travail',
  commute: 'Trajet',
  commitment: 'Engagement',
  custom: 'Autre',
}

/** Ce que le moteur a posé. Le travail à échéance est le plus clair du cadran. */
export const BLOCK_COLOR: Record<BlockKind, string> = {
  task: '#F2F5F7',
  objective: '#A6ADB5',
  ancre: '#6B737C',
}

/** Les teintes proposées à la création. Cinq degrés d'émail, aucune couleur. */
export const CHOOSABLE_SHADES = ['#F2F5F7', '#C3CAD1', '#A6ADB5', '#868E96', '#6B737C'] as const

export function nextShade(index: number): string {
  return CHOOSABLE_SHADES[index % CHOOSABLE_SHADES.length]!
}
