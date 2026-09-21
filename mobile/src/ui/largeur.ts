import { useWindowDimensions } from 'react-native'

/**
 * La largeur disponible, et ce qu'elle autorise.
 *
 * Le bureau compose en DEUX colonnes : l'objet qu'on regarde à gauche, tout ce
 * qui se lit à droite. Son propre commentaire dit pourquoi — centré, le cadran
 * laissait cinq cents pixels de noir mort de chaque côté, « la mise en page
 * d'un téléphone étirée sur un écran large ».
 *
 * L'inverse est vrai aussi, et c'est ce que ce fichier corrige : la mise en
 * page d'un téléphone imposée à un iPad, ou à un iPhone tourné, gaspille
 * exactement la même largeur. Vethos ne choisit donc pas entre les deux
 * compositions — il prend celle que l'écran permet.
 *
 * Les seuils ne sont pas des tailles d'appareil. Ce sont les largeurs à partir
 * desquelles une mise en page CESSE de se casser :
 *
 * - `tableau` : six colonnes de chiffres tiennent côte à côte sans que la
 *   dernière — « Disponible », la seule qu'on vient lire — sorte de l'écran.
 * - `deuxColonnes` : le cadran garde ses 400 points ET il reste de quoi lire
 *   à côté. En dessous, la colonne de droite devient une gouttière.
 */
const SEUIL_TABLEAU = 600
const SEUIL_DEUX_COLONNES = 760

export type Largeur = {
  /** Points logiques disponibles. */
  points: number
  /** Assez large pour le tableau de capacité complet du bureau. */
  tableau: boolean
  /** Assez large pour la composition en deux colonnes du bureau. */
  deuxColonnes: boolean
}

export function useLargeur(): Largeur {
  const { width } = useWindowDimensions()
  return {
    points: width,
    tableau: width >= SEUIL_TABLEAU,
    deuxColonnes: width >= SEUIL_DEUX_COLONNES,
  }
}
