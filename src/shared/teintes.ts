/**
 * Les teintes qu'un engagement peut porter.
 *
 * Re-exporte le système de couleurs centralisé des 3 familles :
 * - Objectifs (rouge)
 * - Tâches (gris)
 * - Ancres / Encre (bleu froid)
 */

export * from './palettes'

/**
 * Teintes historiques pour compatibilité ascendante.
 * Cinq teintes historiques garanties sans vert.
 */
export const TEINTES = ['#c1121f', '#253047', '#55585c', '#9a6a11', '#747474'] as const

/** La teinte suivante, par rang de création. Repart au début après la cinquième. */
export function teinteSuivante(index: number): string {
  return TEINTES[index % TEINTES.length]!
}
