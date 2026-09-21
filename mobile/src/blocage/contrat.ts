/**
 * Le blocage sur iPhone, et pourquoi il ne ressemble en rien à celui du bureau.
 *
 * Sur Windows, Vethos DÉCOUVRE les applications installées, les identifie par les
 * preuves du disque, les classe, puis décide. Tout ce travail — 8 600 lignes — est
 * inutilisable ici, et ce n'est pas un manque d'API : c'est un choix d'Apple.
 *
 * iOS ne dit JAMAIS quelles applications l'utilisateur a choisies. L'utilisateur
 * les désigne dans un sélecteur fourni par le système, et l'application reçoit en
 * retour un jeton opaque. Ce jeton s'affiche — le système sait dessiner l'icône et
 * le nom — mais il ne se lit pas. Impossible de savoir qu'il s'agit d'Instagram.
 *
 * Cette contrainte a une conséquence heureuse : elle impose l'architecture vers
 * laquelle le bureau a déjà convergé. L'utilisateur désigne, l'application applique.
 * Aucune devinette, aucun classement à tenir à jour, aucun catalogue.
 *
 * Ce qui RESTE partagé avec le bureau, et c'est l'essentiel : le moteur de
 * planification. Quand bloquer, combien de temps, quel bloc tombe où, ce qu'il
 * reste de capacité, quand se reposer. C'est la cervelle de Vethos, elle est
 * identique sur les deux plateformes, et elle vit dans `@shared/planning`.
 *
 * Ce que l'utilisateur doit savoir, et que l'interface doit dire :
 * **le blocage iOS se lève.** Une autorisation individuelle se révoque depuis les
 * Réglages avec Face ID. Vethos ne peut pas l'empêcher — aucune application ne le
 * peut. On construit un garde-fou, pas une prison.
 */

import { z } from 'zod'

/**
 * L'état de l'autorisation Temps d'écran.
 *
 * `refusee` n'est pas définitif : l'utilisateur peut revenir. `revoquee` non plus,
 * mais il faut le lui redemander — et lui dire pourquoi son blocage s'est arrêté
 * tout seul, sinon il croira à un défaut.
 */
export type EtatAutorisation = 'inconnue' | 'jamais_demandee' | 'accordee' | 'refusee' | 'revoquee'

/**
 * Ce que l'on garde d'une sélection d'applications.
 *
 * `identifiant` est la clé sous laquelle le module natif range le jeton opaque :
 * le jeton lui-même est parfois énorme — surtout avec des catégories entières —
 * et n'a aucune raison de traverser le pont JavaScript.
 *
 * `nbApplications` et `nbCategories` sont les SEULES choses que l'on apprenne du
 * choix de l'utilisateur. On peut donc écrire « 7 applications écartées », jamais
 * « Instagram écarté ».
 */
/**
 * L'identifiant sous lequel iOS range LA selection de Vethos.
 *
 * Un seul, fixe, et c'est deliberе : la selection persistee d'Apple se retrouve
 * par cette cle au prochain lancement, meme apres un redemarrage du telephone.
 * En generer un nouveau a chaque choix laisserait derriere soi des selections
 * orphelines qu'aucun ecran ne montre plus et que rien ne vient nettoyer.
 */
export const IDENTIFIANT_SELECTION = 'vethos.ecarte'

export const SelectionSchema = z.object({
  identifiant: z.string().min(1),
  nbApplications: z.number().int().min(0),
  nbCategories: z.number().int().min(0),
  nbSitesWeb: z.number().int().min(0),
  /** Nom donné par l'utilisateur : « Réseaux sociaux », « Jeux ». */
  libelle: z.string().max(60),
  creeeLe: z.string().datetime(),
})
export type Selection = z.infer<typeof SelectionSchema>

/** Vide : l'utilisateur a ouvert le sélecteur et n'a rien coché. */
export function selectionEstVide(s: Selection): boolean {
  return s.nbApplications === 0 && s.nbCategories === 0 && s.nbSitesWeb === 0
}

/**
 * Ce que la sélection contient, en français, sans jamais nommer une application.
 *
 * L'interface en a besoin partout, et la formulation doit rester la même d'un
 * écran à l'autre : c'est ce qui donne à l'utilisateur le sentiment que
 * l'application se souvient de ce qu'elle lui a déjà dit.
 */
export function decrireSelection(s: Selection): string {
  const morceaux: string[] = []
  if (s.nbApplications > 0) {
    morceaux.push(`${s.nbApplications} application${s.nbApplications > 1 ? 's' : ''}`)
  }
  if (s.nbCategories > 0) {
    morceaux.push(`${s.nbCategories} catégorie${s.nbCategories > 1 ? 's' : ''}`)
  }
  if (s.nbSitesWeb > 0) {
    morceaux.push(`${s.nbSitesWeb} site${s.nbSitesWeb > 1 ? 's' : ''}`)
  }
  if (morceaux.length === 0) return 'Rien de sélectionné'
  if (morceaux.length === 1) return morceaux[0]!
  const dernier = morceaux.pop()!
  return `${morceaux.join(', ')} et ${dernier}`
}

/**
 * Une plage pendant laquelle le bouclier est levé.
 *
 * Les minutes comptent depuis MINUIT LOCAL, comme dans le moteur partagé : c'est
 * la même unité que `PlacedBlock.startMinute`, ce qui évite toute conversion — et
 * donc toute occasion de se tromper d'une heure au changement d'heure.
 */
export const PlageSchema = z
  .object({
    /** Identifiant du bloc du plan dont cette plage est née. */
    blocId: z.string().min(1),
    debutMinute: z.number().int().min(0).max(24 * 60),
    finMinute: z.number().int().min(0).max(24 * 60),
    selectionId: z.string().min(1),
  })
  .refine((p) => p.finMinute > p.debutMinute, {
    message: 'Une plage se termine après son début.',
  })
export type Plage = z.infer<typeof PlageSchema>

/**
 * Les limites d'iOS, écrites une fois pour toutes.
 *
 * Apple plafonne le nombre de surveillances actives à 20 par application. Au-delà,
 * `startMonitoring` échoue — silencieusement pour l'utilisateur, qui croira que le
 * blocage ne marche pas. Une journée de plan dépasse facilement ce chiffre, d'où
 * la fusion des plages voisines plus bas.
 */
export const MAX_SURVEILLANCES = 20

/**
 * La plus petite plage qu'iOS accepte de surveiller. En dessous, l'événement de
 * fin peut tomber avant celui de début, et le bouclier reste levé.
 */
export const DUREE_MINIMALE_MINUTES = 15

/**
 * Fusionne les plages qui se touchent ou se chevauchent.
 *
 * Deux raisons, et la seconde est la vraie.
 *
 * D'abord le plafond des 20 surveillances : un plan dense en produit bien plus.
 *
 * Ensuite, et surtout : deux blocs collés — une tâche suivie d'un objectif à la
 * même minute — donneraient deux surveillances consécutives. Entre la fin de la
 * première et le début de la seconde, iOS abaisse le bouclier puis le relève. La
 * faille dure moins d'une seconde, mais elle suffit : l'utilisateur qui a son
 * téléphone en main y passe. Fusionner supprime la couture.
 *
 * Les plages doivent partager la même sélection : on ne fusionne pas deux blocs
 * qui écartent des choses différentes.
 */
export function fusionnerPlages(plages: readonly Plage[]): Plage[] {
  if (plages.length === 0) return []

  const triees = [...plages].sort((a, b) => a.debutMinute - b.debutMinute)
  const sortie: Plage[] = []

  for (const plage of triees) {
    const derniere = sortie[sortie.length - 1]
    const memeSelection = derniere?.selectionId === plage.selectionId
    const seTouchent = derniere !== undefined && plage.debutMinute <= derniere.finMinute

    if (derniere && memeSelection && seTouchent) {
      // On garde l'identifiant du PREMIER bloc : c'est celui que l'utilisateur a
      // confirmé, et c'est son nom qui doit s'afficher sur le bouclier.
      derniere.finMinute = Math.max(derniere.finMinute, plage.finMinute)
      continue
    }
    sortie.push({ ...plage })
  }

  return sortie
}

/**
 * Écarte les plages trop courtes pour qu'iOS les tienne, puis plafonne à ce que
 * le système accepte.
 *
 * On garde les plages les plus LONGUES quand il faut choisir : une séance de deux
 * heures protégée vaut mieux que quatre quarts d'heure éparpillés, et c'est aussi
 * ce que l'utilisateur remarquerait en premier si ça manquait.
 */
export function limiterAuxCapacitesIOS(plages: readonly Plage[]): {
  retenues: Plage[]
  ecarteesCourtes: number
  ecarteesPlafond: number
} {
  const assezLongues = plages.filter((p) => p.finMinute - p.debutMinute >= DUREE_MINIMALE_MINUTES)
  const ecarteesCourtes = plages.length - assezLongues.length

  // Toujours rendu dans l'ordre du temps, quelle que soit la branche : l'appelant
  // programme les surveillances les unes après les autres et n'a pas à retrier.
  const parTemps = (liste: Plage[]): Plage[] =>
    [...liste].sort((a, b) => a.debutMinute - b.debutMinute)

  if (assezLongues.length <= MAX_SURVEILLANCES) {
    return { retenues: parTemps(assezLongues), ecarteesCourtes, ecarteesPlafond: 0 }
  }

  const parDuree = [...assezLongues].sort(
    (a, b) => b.finMinute - b.debutMinute - (a.finMinute - a.debutMinute),
  )
  return {
    retenues: parTemps(parDuree.slice(0, MAX_SURVEILLANCES)),
    ecarteesCourtes,
    ecarteesPlafond: assezLongues.length - MAX_SURVEILLANCES,
  }
}
