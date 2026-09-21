import { Platform } from 'react-native'
import { IDENTIFIANT_SELECTION, type EtatAutorisation, type Plage, type Selection } from './contrat'

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
export type PontEcran = {
  /** Ce que le système fournit vraiment, par opposition au simulateur. */
  estReel: boolean
  lireAutorisation: () => Promise<EtatAutorisation>
  demanderAutorisation: () => Promise<EtatAutorisation>
  /** Ouvre le sélecteur d'Apple. `null` si l'utilisateur referme sans choisir. */
  choisirApplications: (selectionExistante?: string) => Promise<Selection | null>
  /** Programme les plages du jour. Rend le nombre réellement programmé. */
  programmer: (plages: readonly Plage[]) => Promise<number>
  /** Lève tout : aucun bouclier ne doit survivre à un arrêt. */
  toutLever: () => Promise<void>
}

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
        libelle: 'Ce qui me disperse',
        creeeLe: new Date().toISOString(),
      }
    },

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
 * `react-native-device-activity` n'existe que sur iOS 16+. On ne l'importe donc
 * qu'au moment où on en a besoin, et jamais sur une autre plateforme : un import
 * en tête de fichier ferait tomber le navigateur avant le premier rendu.
 */
function creerPontNatif(): PontEcran {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const natif = require('react-native-device-activity') as typeof import('react-native-device-activity')

  const traduire = (brut: string): EtatAutorisation => {
    if (brut === 'approved') return 'accordee'
    if (brut === 'denied') return 'refusee'
    return 'jamais_demandee'
  }

  return {
    estReel: true,

    async lireAutorisation() {
      return traduire(String(natif.getAuthorizationStatus()))
    },

    async demanderAutorisation() {
      await natif.requestAuthorization('individual')
      return traduire(String(natif.getAuthorizationStatus()))
    },

    async choisirApplications() {
      // Le sélecteur d'Apple n'est PAS une fonction : c'est une vue native que
      // l'on affiche. Il est rendu par `SelecteurApplications`, qui appelle
      // ensuite `enregistrerSelection` ci-dessous. Cette méthode n'existe ici
      // que pour tenir le contrat commun avec le simulateur.
      return null
    },

    async programmer(plages) {
      // On repart toujours de zéro : réconcilier des surveillances existantes
      // avec un plan recalculé coûte plus cher que de tout reposer, et laisse
      // des boucliers orphelins au moindre écart.
      natif.stopMonitoring()

      const maintenant = minuteCourante()

      for (const plage of plages) {
        const activite = nomActivite(plage.blocId)

        // Surveiller ne bloque RIEN. `startMonitoring` dit seulement à iOS de
        // réveiller l'extension aux bornes de la fenêtre ; c'est ce qu'elle
        // fait en se réveillant qui compte. Sans ces deux `configureActions`,
        // les surveillances se programmaient correctement et aucun bouclier ne
        // se levait jamais — une application de blocage qui ne bloque pas, et
        // qui n'a pas une erreur à montrer pour l'expliquer.
        natif.configureActions({
          activityName: activite,
          callbackName: 'intervalDidStart',
          actions: [{ type: 'blockSelection', familyActivitySelectionId: plage.selectionId }],
        })
        natif.configureActions({
          activityName: activite,
          callbackName: 'intervalDidEnd',
          actions: [{ type: 'resetBlocks' }],
        })

        await natif.startMonitoring(
          activite,
          {
            intervalStart: minuteVersComposantes(plage.debutMinute),
            intervalEnd: minuteVersComposantes(plage.finMinute),
            repeats: false,
          },
          [],
        )
      }

      // `intervalDidStart` ne se déclenche qu'au FRANCHISSEMENT de la borne.
      // Or une séance vient d'être confirmée : sa fenêtre a déjà commencé, la
      // borne est derrière nous, et le rappel ne viendra jamais. Le bouclier
      // de la séance en cours se lève donc ici, tout de suite. Celui-là est le
      // seul qui compte vraiment — c'est maintenant qu'on travaille.
      const enCours = plages.find((p) => maintenant >= p.debutMinute && maintenant < p.finMinute)
      if (enCours) {
        natif.blockSelection(
          { activitySelectionId: enCours.selectionId },
          `vethos:seance:${enCours.blocId}`,
        )
      } else {
        // Aucune séance en cours : rien ne doit rester levé d'une précédente.
        natif.resetBlocks('vethos:aucune-seance')
      }

      return plages.length
    },

    async toutLever() {
      natif.stopMonitoring()
      for (const activite of natif.getActivities()) natif.cleanUpAfterActivity(activite)
      // `resetBlocks` abaisse les boucliers déjà levés. Sans lui, arrêter la
      // surveillance laisserait l'utilisateur derrière un écran que plus rien ne
      // viendrait retirer.
      natif.resetBlocks('vethos:tout-lever')
    },
  }
}

/**
 * Le nom d'activite d'un bloc.
 *
 * Prefixe, parce que `stopMonitoring()` sans argument arrete TOUT ce que
 * l'application surveille : sans prefixe on ne saurait plus, en lisant
 * `getActivities()`, ce qui vient de Vethos et ce qui vient d'ailleurs.
 */
function nomActivite(blocId: string): string {
  return `vethos.${blocId}`
}

function minuteCourante(): number {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}

/** Les composantes horaires qu'attend `DeviceActivitySchedule`. */
function minuteVersComposantes(minute: number): { hour: number; minute: number } {
  return { hour: Math.floor(minute / 60) % 24, minute: minute % 60 }
}

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
