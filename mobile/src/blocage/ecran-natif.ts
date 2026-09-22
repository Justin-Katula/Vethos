import { Platform } from 'react-native'
import { IDENTIFIANT_SELECTION, type EtatAutorisation, type Plage, type Selection } from './contrat'
import type { PontEcran } from './contrat'
import { creerPontDepuis, type ModuleEcran } from './pont-natif'

export { creerPontDepuis, type ModuleEcran } from './pont-natif'

/**
 * La frontière entre Vethos et le Temps d'écran d'Apple.
 *
 * Tout ce qui touche à `FamilyControls`, `ManagedSettings` et `DeviceActivity`
 * passe par ici, et par rien d'autre. Deux raisons :
 *
 * 1. Le reste de l'application reste testable sans iPhone. La logique — fusion
 *    des plages, plafond des 20 surveillances, conversion du plan — est pure et
 *    se vérifie sur n'importe quelle machine.
 * 2. L'application tourne dans un navigateur, donc **se regarde** avant d'avoir
 *    un Mac, un certificat et l'autorisation d'Apple. Sans cette frontière, le
 *    premier import ferait tomber la page entière.
 *
 * Le simulateur n'est pas un bouchon vide : il se comporte comme iOS, délais
 * compris, pour que ce que l'on voit ressemble à ce que l'on aura.
 */
export type { PontEcran } from './contrat'

// --------------------------------------------------------------------------
// Simulateur — pour le navigateur, les tests, et pour regarder l'application
// avant d'avoir le droit de la construire.
// --------------------------------------------------------------------------

const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function creerPontSimule(): PontEcran {
  let autorisation: EtatAutorisation = 'jamais_demandee'
  let programmees = 0

  return {
    estReel: false,

    async lireAutorisation() {
      return autorisation
    },

    async demanderAutorisation() {
      // iOS présente une feuille système : l'attente fait partie de ce que
      // l'utilisateur ressent, donc le simulateur la reproduit.
      await attendre(700)
      autorisation = 'accordee'
      return autorisation
    },

    async choisirApplications() {
      await attendre(500)
      // Ce qu'un vrai choix rend : des NOMBRES, jamais des noms. iOS ne nous
      // dit pas de quelles applications il s'agit, et le simulateur non plus —
      // sans quoi on écrirait une interface impossible à tenir.
      return {
        // Le MEME identifiant que le vrai pont : ce qu'on regarde dans le
        // navigateur doit se comporter comme ce qu'on aura sur l'appareil.
        identifiant: IDENTIFIANT_SELECTION,
        nbApplications: 7,
        nbCategories: 2,
        nbSitesWeb: 0,
        libelle: 'What pulls me away',
        creeeLe: new Date().toISOString(),
      }
    },

    // `maintenant` ne sert qu'au vrai pont, qui doit savoir quelle plage a
    // deja commence pour lever son bouclier tout de suite. Le simulateur n'a
    // pas de bouclier a lever : il se contente de compter.
    async programmer(plages) {
      await attendre(220)
      programmees = plages.length
      return programmees
    },

    async toutLever() {
      await attendre(120)
      programmees = 0
    },
  }
}

// --------------------------------------------------------------------------
// Pont réel — chargé paresseusement, et seulement sur iOS.
// --------------------------------------------------------------------------

/**
 * Ce que Vethos utilise du Temps d'écran d'Apple, et rien de plus.
 *
 * Écrit comme un paramètre plutôt que comme un import : c'est ce qui permet de
 * VÉRIFIER la séquence d'appels sans iPhone, sans compte Apple et sans
 * l'entitlement d'Apple. Sans ça, le seul chemin du produit qui touche
 * vraiment au système était aussi le seul que rien ne testait — et il a déjà
 * menti une fois (`requireOptionalNativeModule` rend `null` au lieu de lever).
 */
let pont: PontEcran | null = null

/**
 * Le pont de cette plateforme. Réel sur iPhone, simulé partout ailleurs.
 *
 * Si le module natif manque — construction sans le greffon, ou Expo Go — on
 * bascule sur le simulateur plutôt que de tomber : mieux vaut une application
 * qui s'ouvre et dit la vérité qu'un écran blanc.
 */
export function pontEcran(): PontEcran {
  if (pont) return pont
  if (Platform.OS !== 'ios') {
    pont = creerPontSimule()
    return pont
  }
  try {
    pont = creerPontNatif()
  } catch {
    pont = creerPontSimule()
  }
  return pont
}

/**
 * `react-native-device-activity` n'existe que sur iOS 16+. On ne l'importe donc
 * qu'au moment où on en a besoin, et jamais sur une autre plateforme : un import
 * en tête de fichier ferait tomber le navigateur avant le premier rendu.
 */
function creerPontNatif(): PontEcran {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return creerPontDepuis(require('react-native-device-activity') as ModuleEcran)
}
