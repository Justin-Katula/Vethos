import type { EtatAutorisation, Plage, PontEcran } from './contrat'
import type { ActionsBouclier, ConfigurationBouclier } from './bouclier'

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

/** Ce qu'une surveillance doit faire en se réveillant, à l'une ou l'autre borne. */
export type ActionNative =
  | { type: 'blockSelection'; familyActivitySelectionId: string }
  | { type: 'enableBlockAllMode' }
  | { type: 'disableBlockAllMode' }
  | { type: 'setWebContentFilterPolicy'; policy: PolitiqueWeb }
  | { type: 'clearWebContentFilterPolicy' }
  | { type: 'resetBlocks' }

/**
 * Ce qu'iOS sait filtrer du web, et rien de plus.
 *
 * `auto` est le filtre d'Apple lui-même : il n'a pas de liste à tenir à jour,
 * donc rien à laisser vieillir. `all` écarte tout sauf les exceptions.
 */
export type PolitiqueWeb =
  | { type: 'none' }
  | { type: 'auto'; exceptDomains?: string[] }
  | { type: 'all'; exceptDomains?: string[] }

export type ModuleEcran = {
  isAvailable: () => boolean
  getAuthorizationStatus: () => unknown
  requestAuthorization: (pour: 'individual' | 'child') => Promise<unknown>
  configureActions: (a: {
    activityName: string
    callbackName: 'intervalDidStart' | 'intervalDidEnd'
    actions: ActionNative[]
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

  /** Dépose l'habillage du bouclier pour l'extension, qui le lira sans nous. */
  updateShield: (
    configuration: ConfigurationBouclier,
    actions: ActionsBouclier,
    declenchePar?: string,
  ) => void
  /** La seule question à laquelle iOS répond vraiment : un bouclier est-il levé ? */
  isShieldActive: () => boolean

  /** Mode profond : tout est écarté, sauf la liste gardée. */
  enableBlockAllMode: (declenchePar?: string) => void
  disableBlockAllMode: (declenchePar?: string) => void
  addSelectionToWhitelistAndUpdateBlock: (
    selection: { activitySelectionId: string },
    declenchePar?: string,
  ) => void
  clearWhitelistAndUpdateBlock: (declenchePar?: string) => void

  setWebContentFilterPolicy: (politique: PolitiqueWeb, declenchePar?: string) => void
  clearWebContentFilterPolicy: (declenchePar?: string) => void
  isWebContentFilterPolicyActive: () => boolean
  /** L'App Group partagé avec les extensions (lecture seule ici). */
  userDefaultsGet?: <T>(cle: string) => T | undefined
}

/**
 * Ce qu'`AuthorizationCenter` rend vraiment : un ENTIER.
 *
 * Le défaut le plus cher de tout le blocage a vécu ici. Le pont comparait la
 * réponse aux chaînes `'approved'` et `'denied'` — des valeurs qui n'existent
 * nulle part dans le greffon. Swift rend `status.rawValue`, c'est-à-dire 0, 1
 * ou 2. **Les trois états retombaient donc sur « jamais demandée ».**
 *
 * Sur l'appareil, cela donnait ceci : on accorde le Temps d'écran, iOS
 * enregistre l'accord, et Vethos continue d'afficher « Allow » pour toujours.
 * Le bouton du sélecteur restait désactivé, aucune application ne pouvait
 * être désignée, et rien ne pouvait jamais être masqué. Une application de
 * blocage bloquée par sa propre lecture d'une réponse.
 *
 * Et les tests passaient : l'espion rendait `'approved'`, c'est-à-dire ce
 * qu'on CROYAIT que le module rend. Un doublure écrite d'après une croyance
 * ne vérifie que la croyance. Celle du test s'ancre maintenant sur la
 * constante exportée par le greffon lui-même.
 */
export const AUTORISATION_IOS = { indetermine: 0, refusee: 1, accordee: 2 } as const

/**
 * Une valeur qu'on ne reconnaît pas rend `'inconnue'`, jamais
 * « jamais demandée ».
 *
 * C'est le coeur de la leçon. L'ancien repli traduisait l'incompréhension en
 * un état plausible, et l'écran affichait tranquillement un bouton faux. Un
 * état qui ne se lit pas doit se voir.
 */
export function traduireAutorisation(brut: unknown): EtatAutorisation {
  const valeur =
    typeof brut === 'number' ? brut : typeof brut === 'string' ? Number(brut) : Number.NaN
  switch (valeur) {
    case AUTORISATION_IOS.accordee:
      return 'accordee'
    case AUTORISATION_IOS.refusee:
      return 'refusee'
    case AUTORISATION_IOS.indetermine:
      return 'jamais_demandee'
    default:
      return 'inconnue'
  }
}

/** Le pont, à partir d'un module donné. La seule forme testable. */
export function creerPontDepuis(natif: ModuleEcran): PontEcran {
  // `require` REUSSIT toujours, meme sans le module natif : le paquet appelle
  // `requireOptionalNativeModule`, qui rend `null` au lieu de lever. Dans Expo
  // Go, on obtenait donc un pont qui se disait REEL, dont chaque appel ne
  // faisait rien en silence, et un ecran qui promettait un masquage qui
  // n'arriverait jamais. Exactement le mensonge que cet ecran existe pour
  // eviter. `isAvailable()` est le seul test qui distingue les deux.
  if (!natif.isAvailable()) throw new Error('Screen Time is missing from this build')

  return {
    estReel: true,

    async lireAutorisation() {
      return traduireAutorisation(natif.getAuthorizationStatus())
    },

    async demanderAutorisation() {
      try {
        await natif.requestAuthorization('individual')
      } catch {
        // iOS LÈVE quand l'utilisateur referme la feuille système sans
        // accorder — et il lève aussi, sans rien afficher, quand il a déjà
        // refusé une fois. Dans les deux cas la réponse est le STATUT, pas
        // l'exception : la relire ci-dessous dit la vérité, la laisser
        // remonter ne dit rien à personne. Sans ce filet, un refus partait
        // en rejet non attrapé, l'écran restait sur « Allow », et retaper
        // ne produisait plus jamais rien.
      }
      return traduireAutorisation(natif.getAuthorizationStatus())
    },

    async choisirApplications() {
      // Le sélecteur d'Apple n'est PAS une fonction : c'est une vue native que
      // l'on affiche. Il est rendu par `SelecteurApplications`, qui appelle
      // ensuite `enregistrerSelection` ci-dessous. Cette méthode n'existe ici
      // que pour tenir le contrat commun avec le simulateur.
      return null
    },

    habillerBouclier(habillage) {
      // Une simple écriture dans le groupe d'applications : l'extension la
      // relira toute seule, dans son processus, sans que Vethos tourne.
      natif.updateShield(habillage.configuration, habillage.actions, 'vethos:habillage')
    },

    bouclierActif() {
      // La seule vérification qui ne se raconte pas d'histoire. Tout le reste
      // de l'écran décrit ce que Vethos a DEMANDÉ ; ceci dit ce qu'iOS FAIT.
      return natif.isShieldActive()
    },

    diagnostic() {
      return {
        moduleReel: true,
        // La valeur BRUTE, pas notre traduction. C'est précisément la
        // traduction qui a menti pendant tout ce temps — un diagnostic qui
        // n'affiche que le résultat traduit aurait répété le mensonge avec
        // l'autorité d'un outil de diagnostic.
        autorisationBrute: natif.getAuthorizationStatus(),
        autorisationLue: traduireAutorisation(natif.getAuthorizationStatus()),
        surveillances: natif.getActivities().filter((a) => a.startsWith('vethos.')).length,
        bouclierLeve: natif.isShieldActive(),
        filtreWebActif: natif.isWebContentFilterPolicyActive(),
      }
    },

    async programmer(plages, options = {}) {
      const maintenant = options.maintenant ?? minuteCourante()
      const profond = options.mode === 'profond'
      const politique = options.filtrerLeWeb === true ? FILTRE_WEB : null

      // On repart toujours de zéro : réconcilier des surveillances existantes
      // avec un plan recalculé coûte plus cher que de tout reposer, et laisse
      // des boucliers orphelins au moindre écart.
      natif.stopMonitoring()

      // Le mode profond s'éteint AVANT qu'on touche à la liste gardée.
      //
      // Il n'existe pas de « poser la liste » atomique : on vide, puis on
      // ajoute. Entre les deux, la liste est vide — et tant que le mode
      // profond tient, « tout sauf rien » veut dire TOUT, Vethos compris.
      // Changer sa liste gardée pendant une séance profonde enfermait donc
      // l'utilisateur hors de l'application qui aurait pu l'en sortir.
      //
      // La fenêtre est brève dans les deux sens, mais elle n'est pas
      // symétrique : perdre le bouclier pendant un battement alors qu'on a
      // Vethos sous les yeux ne coûte rien, être enfermé dehors coûte un
      // passage par les Réglages d'iOS. On choisit le trou, pas la serrure.
      natif.disableBlockAllMode('vethos:reconstruction')

      // La liste gardée est reposée AVANT toute surveillance : en mode profond
      // elle est le seul « sauf », et `enableBlockAllMode` la lit telle qu'il
      // la trouve. Posée après, la première fenêtre à s'ouvrir écarterait tout
      // sans exception — y compris ce que l'utilisateur avait gardé.
      natif.clearWhitelistAndUpdateBlock('vethos:liste-gardee')
      if (profond && options.gardeeId) {
        natif.addSelectionToWhitelistAndUpdateBlock(
          { activitySelectionId: options.gardeeId },
          'vethos:liste-gardee',
        )
      }

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
          actions: [
            profond
              ? { type: 'enableBlockAllMode' }
              : { type: 'blockSelection', familyActivitySelectionId: plage.selectionId },
            ...(politique ? [{ type: 'setWebContentFilterPolicy' as const, policy: politique }] : []),
          ],
        })
        natif.configureActions({
          activityName: activite,
          callbackName: 'intervalDidEnd',
          actions: [
            // `resetBlocks` seul NE défait PAS le mode profond : celui-ci vit
            // dans son propre drapeau, que rien d'autre ne retire. Sans cette
            // première action, une séance profonde ne se terminait jamais —
            // et comme Vethos peut être derrière son propre bouclier, il
            // n'était plus possible de la lever depuis l'application.
            ...(profond ? [{ type: 'disableBlockAllMode' as const }] : []),
            ...(politique ? [{ type: 'clearWebContentFilterPolicy' as const }] : []),
            { type: 'resetBlocks' },
          ],
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
        const parQui = `vethos:seance:${enCours.blocId}`
        if (profond) natif.enableBlockAllMode(parQui)
        else natif.blockSelection({ activitySelectionId: enCours.selectionId }, parQui)
        if (politique) natif.setWebContentFilterPolicy(politique, parQui)
      } else {
        // Aucune séance en cours : rien ne doit rester levé d'une précédente.
        natif.disableBlockAllMode('vethos:aucune-seance')
        natif.clearWebContentFilterPolicy('vethos:aucune-seance')
        natif.resetBlocks('vethos:aucune-seance')
      }

      return plages.length
    },

    lireTentatives() {
      // Rangées par l'extension ShieldConfiguration à chaque bouclier montré.
      const brut = natif.userDefaultsGet?.<unknown>('vethos_tentatives')
      return Array.isArray(brut) ? brut.filter((t): t is number => typeof t === 'number') : []
    },

    async toutLever() {
      natif.stopMonitoring()
      for (const activite of natif.getActivities()) natif.cleanUpAfterActivity(activite)
      // Trois verrous distincts, et lever le premier ne lève pas les autres.
      // « Tout lever » qui laisse le mode profond debout serait le pire
      // mensonge de cet écran : le bouton le plus rassurant, et celui qui ne
      // fait rien là où on en a le plus besoin.
      natif.disableBlockAllMode('vethos:tout-lever')
      natif.clearWhitelistAndUpdateBlock('vethos:tout-lever')
      natif.clearWebContentFilterPolicy('vethos:tout-lever')
      // `resetBlocks` abaisse les boucliers déjà levés. Sans lui, arrêter la
      // surveillance laisserait l'utilisateur derrière un écran que plus rien ne
      // viendrait retirer.
      natif.resetBlocks('vethos:tout-lever')
    },
  }
}

/**
 * Le filtre web de Vethos : celui d'Apple, sans liste à nous.
 *
 * Tenir notre propre liste de domaines voudrait dire la maintenir — et une
 * liste de blocage qui vieillit laisse passer exactement ce qu'elle promet
 * d'écarter, sans jamais le dire. Les sites que l'utilisateur désigne
 * lui-même, eux, passent par le sélecteur d'Apple et sont déjà écartés avec
 * ses applications.
 */
const FILTRE_WEB = { type: 'auto' } as const

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
