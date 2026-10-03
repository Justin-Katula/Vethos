/**
 * Le tiroir de ce compte est-il déjà ouvert et lu, des deux côtés (engagements
 * et séances) ? Alors il n'y a rien à rouvrir : le recharger remettait
 * `chargees` à faux, ce qui faisait disparaître tout le plan quelques instants,
 * puis le faisait revenir.
 */
export function tiroirDejaOuvert(
  compte: string | null,
  donnees: { chargees: boolean; proprietaire: string | null },
  seances: { chargees: boolean; proprietaire: string | null },
): boolean {
  if (!compte) return false
  return donnees.chargees && donnees.proprietaire === compte && seances.chargees && seances.proprietaire === compte
}
