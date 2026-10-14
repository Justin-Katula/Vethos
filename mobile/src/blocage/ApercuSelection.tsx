import { Text } from 'react-native'
import { vueJetons } from '../../modules/vethos-jetons'
import { decrireSelection, type Selection } from './contrat'
import { GEIST } from '@/ui/primitives'

/**
 * Ce qui est écarté, montré dans l'interface de Vethos : icônes et noms réels,
 * DESSINÉS par iOS (`modules/vethos-jetons`) — le code ne les lit jamais.
 * Sans la vue native (Expo Go, web, build ancienne) : les nombres, comme avant.
 */
const Vue = vueJetons()

/** La hauteur d'une ligne (icône + nom) et l'espace entre deux, pour une police donnée. */
const hauteurLigne = (taille: number) => Math.round(taille * 1.45)
const ESPACE = 12

export function ApercuSelection({
  selection,
  couleur,
  taillePolice = 16,
  maxLignes,
}: {
  selection: Selection
  couleur: string
  taillePolice?: number
  /** Au-delà, la liste est coupée (le reste reste écarté, simplement pas montré). */
  maxLignes?: number
}) {
  const lignes = selection.nbCategories + selection.nbApplications + selection.nbSitesWeb
  if (!Vue || lignes === 0) {
    return <Text style={{ color: couleur, fontFamily: GEIST.moyen, fontSize: taillePolice }}>{decrireSelection(selection)}</Text>
  }
  const montrees = maxLignes ? Math.min(lignes, maxLignes) : lignes
  const hauteur = montrees * hauteurLigne(taillePolice) + (montrees - 1) * ESPACE
  // La clé change avec les comptes : une sélection modifiée se redessine.
  const version = selection.nbCategories * 10_000 + selection.nbApplications * 100 + selection.nbSitesWeb
  return (
    <Vue
      selectionId={selection.identifiant}
      version={version}
      couleur={couleur}
      taillePolice={taillePolice}
      style={{ width: '100%', height: hauteur }}
    />
  )
}
