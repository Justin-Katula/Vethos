import type { EtatAutorisation, Plage, PontEcran } from './contrat'

/**
 * Ce que Vethos demande au Temps d'écran d'Apple, et rien de plus.
 *
 * Séparé de `ecran-natif.ts` pour une raison qui vaut le fichier : celui-là
 * importe `Platform` de React Native, et un test ne peut donc pas le charger.
 * Le seul chemin du produit qui touche vraiment au système était aussi le seul
 * que rien ne vérifiait — et il a déjà menti une fois.
 *
 * Ici, aucun import de React Native. La séquence d'appels se vérifie sur
 * n'importe quelle machine, sans iPhone, sans compte Apple, et sans
 * l'entitlement que seul Apple accorde.
 */

export type ModuleEcran = {
  isAvailable: () => boolean
  getAuthorizationStatus: () => unknown
  requestAuthorization: (pour: 'individual' | 'child') => Promise<unknown>
  configureActions: (a: {
    activityName: string
    callbackName: 'intervalDidStart' | 'intervalDidEnd'
    actions: ({ type: 'blockSelection'; familyActivitySelectionId: string } | { type: 'resetBlocks' })[]
  }) => void
  startMonitoring: (
    nom: string,
    horaire: { intervalStart: { hour: number; minute: number }; intervalEnd: { hour: number; minute: number }; repeats: boolean },
    evenements: unknown[],
  ) => Promise<unknown>
  stopMonitoring: () => void
  blockSelection: (selection: { activitySelectionId: string }, declenchePar?: string) => void
  resetBlocks: (declenchePar?: string) => void
  getActivities: () => string[]
  cleanUpAfterActivity: (nom: string) => void
}

/** Le pont, à partir d'un module donné. La seule forme testable. */
export function creerPontDepuis(natif: ModuleEcran): PontEcran {
  // `require` REUSSIT toujours, meme sans le module natif : le paquet appelle
  // `requireOptionalNativeModule`, qui rend `null` au lieu de lever. Dans Expo
  // Go, on obtenait donc un pont qui se disait REEL, dont chaque appel ne
  // faisait rien en silence, et un ecran qui promettait un masquage qui
  // n'arriverait jamais. Exactement le mensonge que cet ecran existe pour
  // eviter. `isAvailable()` est le seul test qui distingue les deux.
  if (!natif.isAvailable()) throw new Error('Temps d’écran absent de cette version')

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

    async programmer(plages, maintenant = minuteCourante()) {
      // On repart toujours de zéro : réconcilier des surveillances existantes
      // avec un plan recalculé coûte plus cher que de tout reposer, et laisse
      // des boucliers orphelins au moindre écart.
      natif.stopMonitoring()

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
