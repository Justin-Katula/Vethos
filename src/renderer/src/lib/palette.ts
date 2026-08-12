import type { ScheduleCategory } from '@shared/schemas'
import type { BlockKind } from '@/lib/planning/types'

/**
 * La palette de Vethos.
 *
 * Une seule règle : on distingue par la LUMINOSITÉ, jamais par la teinte.
 * Douze catégories en douze couleurs, c'est un tableau de bord ; douze
 * catégories en douze gris, c'est une interface qu'on lit d'un coup d'œil.
 *
 * Les deux seules couleurs de l'application signalent un danger prouvé. Si
 * quelque chose est rouge, c'est que c'est cassé — pas que c'est décoré.
 */

export const DANGER = 'var(--color-danger)'
export const WARNING = 'var(--color-warning)'

/** Réalité fixe : plus c'est contraignant, plus c'est sombre. */
export const CATEGORY_COLOR: Record<ScheduleCategory, string> = {
  sleep: '#111113',
  school: '#E2E2E2',
  work: '#A8A8AC',
  commute: '#525252',
  commitment: '#737373',
  custom: '#5E5E62',
}

export const CATEGORY_LABEL: Record<ScheduleCategory, string> = {
  sleep: 'Sommeil',
  school: 'École',
  work: 'Travail',
  commute: 'Trajet',
  commitment: 'Engagement',
  custom: 'Autre',
}

/** Le plan : ce qui t'appartient est clair, ce qui est fixe est sourd. */
export const BLOCK_COLOR: Record<BlockKind, string> = {
  task: '#E8E8E8',
  objective: '#A8A8AC',
  ancre: '#737373',
}

/**
 * Les teintes proposées à la création d'un objectif ou d'une ancre.
 * Cinq niveaux de gris — assez pour se repérer, jamais assez pour crier.
 */
export const CHOOSABLE_SHADES = ['#E8E8E8', '#C4C4C8', '#A8A8AC', '#8A8A8E', '#6E6E72'] as const

export function nextShade(index: number): string {
  return CHOOSABLE_SHADES[index % CHOOSABLE_SHADES.length]!
}
