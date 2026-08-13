import type { ScheduleCategory } from '@shared/schemas'
import type { BlockKind } from '@/lib/planning/types'

/**
 * Noir, gris, blanc.
 *
 * Sans teinte, la seule chose qui distingue deux blocs est leur clarté, et
 * cette clarté doit vouloir dire quelque chose : plus un bloc est clair, plus
 * le temps qu'il occupe t'appartient.
 *
 * Ce qui est déjà pris est sombre. Ce que tu as choisi de faire est clair.
 * Ce que le moteur a placé pour toi est le plus clair de tous.
 */

/** Ce qui est déjà pris : quasi indiscernable du fond, par choix. */
export const CATEGORY_COLOR: Record<ScheduleCategory, string> = {
  sleep: '#0F0F12',
  school: '#2E2E35',
  work: '#34343C',
  commute: '#1E1E23',
  commitment: '#282830',
  custom: '#232329',
}

export const CATEGORY_LABEL: Record<ScheduleCategory, string> = {
  sleep: 'Sommeil',
  school: 'École',
  work: 'Travail',
  commute: 'Trajet',
  commitment: 'Engagement',
  custom: 'Autre',
}

/** Ce que le moteur a placé. Le travail à échéance est le plus clair. */
export const BLOCK_COLOR: Record<BlockKind, string> = {
  task: '#FFFFFF',
  objective: '#9B9BA4',
  ancre: '#62626B',
}

/** L'encre à poser SUR un bloc, pour rester lisible sur sa clarté. */
export const BLOCK_INK: Record<BlockKind, string> = {
  task: '#08080A',
  objective: '#08080A',
  ancre: '#FFFFFF',
}

/** Les nuances proposées à la création. Cinq degrés de gris, aucune couleur. */
export const CHOOSABLE_SHADES = ['#FFFFFF', '#C9C9D1', '#9B9BA4', '#7A7A83', '#62626B'] as const

export function nextShade(index: number): string {
  return CHOOSABLE_SHADES[index % CHOOSABLE_SHADES.length]!
}
