/**
 * Les teintes qu'un engagement peut porter.
 *
 * Cinq, pas une de plus, et attribuées dans l'ordre de création — jamais
 * choisies. Un sélecteur de couleur transformerait une liste d'engagements en
 * décoration personnelle : on passerait du temps à assortir des pastilles au
 * lieu de déclarer ce qu'on veut faire, et rien de ce temps-là n'avance le
 * plan. Cinq teintes suffisent à distinguer cinq objectifs côte à côte ; au
 * sixième, c'est le NOM qui distingue, pas la couleur.
 *
 * **Aucun vert.** L'olive #58664A et le gris-vert #6F7671 ont quitté cette
 * liste : la règle d'identité interdit toute teinte entre 60° et 170°, sans
 * exception ni nuance.
 */
export const TEINTES = ['#c1121f', '#253047', '#55585c', '#9a6a11', '#747474'] as const

/** La teinte suivante, par rang de création. Repart au début après la cinquième. */
export function teinteSuivante(index: number): string {
  return TEINTES[index % TEINTES.length]!
}
