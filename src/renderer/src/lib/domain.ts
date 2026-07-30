/**
 * Normalise un domaine saisi à la main.
 *
 * L'utilisateur colle ce qu'il a sous la main — une URL complète, un `www.`,
 * une majuscule. On ramène tout à la forme que le moteur compare :
 * `https://www.YouTube.com/feed` → `youtube.com`.
 *
 * Vit dans son propre module plutôt que dans la page : c'est une fonction pure
 * et elle doit être testable sans charger un composant qui touche `window`.
 *
 * Renvoie `null` si ce n'est pas un domaine plausible.
 */
export function normaliserDomaine(saisie: string): string | null {
  const brut = saisie
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//u, '')
    .replace(/^www\./u, '')
    .split('/')[0]

  if (brut === undefined || brut.length === 0) return null
  // Au moins un point, et rien d'exotique. Sans cette garde, taper « youtube »
  // créerait une règle qui ne correspondrait jamais à rien, en silence.
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/u.test(brut)) return null
  return brut
}
