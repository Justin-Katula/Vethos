import { THEMES, type Jetons, type NomTheme } from '@/theme/jetons'
import { enHeure } from '@/plan/format'

/**
 * Le bouclier : l'écran qu'on voit quand on ouvre une application écartée.
 *
 * C'est le SEUL morceau de Vethos que l'on rencontre sans avoir ouvert Vethos,
 * et jusqu'ici c'était le gris générique d'Apple. Une application de blocage se
 * reconnaît d'abord à ça — l'utilisateur voit cet écran dix fois par jour et
 * n'ouvre le nôtre qu'une fois.
 *
 * Il vit dans un autre PROCESSUS que l'application : iOS réveille une extension
 * qui n'a ni notre état, ni notre thème, ni le plan. Elle ne lit qu'un objet
 * déposé d'avance dans le groupe d'applications. D'où la forme de ce fichier :
 * une fonction pure qui FABRIQUE cet objet, appelée au moment où l'on sait
 * encore tout, et vérifiable sans iPhone.
 *
 * Ce que le bouclier a le droit de dire (loi F — jamais un jugement, jamais une
 * question) : le nom de l'application, le bloc en cours, l'heure de fin. Trois
 * faits. Pas d'encouragement, pas « es-tu sûr ? », pas de décompte culpabilisant.
 */

/** Une couleur telle qu'UIKit l'attend : composantes 0-255, alpha 0-1. */
export type CouleurIOS = { red: number; green: number; blue: number; alpha?: number }

/**
 * Ce qu'iOS dessine. Un sous-ensemble volontaire de `ShieldConfiguration` :
 * seulement les champs que Vethos remplit vraiment, pour qu'on ne puisse pas
 * croire qu'un champ est posé alors qu'il ne l'est pas.
 */
export type ConfigurationBouclier = {
  backgroundColor: CouleurIOS
  title: string
  titleColor: CouleurIOS
  subtitle: string
  subtitleColor: CouleurIOS
  iconSystemName: string
  iconTint: CouleurIOS
  primaryButtonLabel: string
  primaryButtonLabelColor: CouleurIOS
  primaryButtonBackgroundColor: CouleurIOS
  secondaryButtonLabel: string
  secondaryButtonLabelColor: CouleurIOS
}

/** Ce qui se passe quand on touche un bouton du bouclier. */
export type ActionBouclier = {
  behavior: 'close' | 'defer'
  actions?: { type: 'openApp' | 'disableBlockAllMode' }[]
}
export type ActionsBouclier = { primary: ActionBouclier; secondary?: ActionBouclier }

/**
 * Le jeton qu'iOS remplace par le nom de l'application bloquée.
 *
 * C'est la seule fois où le nom d'une application traverse Vethos — et encore,
 * il ne le traverse pas : l'extension le substitue chez elle, dans son propre
 * processus. L'application, elle, ne le voit jamais. La promesse tenue à
 * l'écran Blocage (« iOS ne nous dit pas de quelles applications il s'agit »)
 * reste donc vraie mot pour mot.
 */
export const NOM_APPLICATION = '{applicationOrDomainDisplayName}'

/**
 * `#rrggbb` vers les composantes d'UIKit.
 *
 * Les jetons du thème sont la source : écrire les couleurs du bouclier à la
 * main les aurait laissées dériver au premier ajustement de palette, et
 * personne ne l'aurait vu — le bouclier ne s'affiche que sur un vrai appareil,
 * pendant une vraie séance.
 */
export function versCouleurIOS(hex: string, alpha?: number): CouleurIOS {
  const brut = hex.replace('#', '')
  const lire = (i: number): number => Number.parseInt(brut.slice(i, i + 2), 16)
  return {
    red: lire(0),
    green: lire(2),
    blue: lire(4),
    ...(alpha === undefined ? {} : { alpha }),
  }
}

/**
 * Ce que dit le bouclier d'une séance en cours.
 *
 * Le sous-titre porte le bloc et son heure de fin, parce que c'est la seule
 * chose utile à savoir à cet instant : non pas « tu es bloqué », mais « voici
 * ce qui tourne, et jusqu'à quand ». La différence n'est pas cosmétique — la
 * première phrase parle de l'utilisateur, la seconde parle du plan.
 *
 * Sans séance connue, on ne fabrique pas une phrase vague : on dit l'heure de
 * fin seule. Un bouclier qui invente un contexte qu'il n'a pas est pire qu'un
 * bouclier laconique.
 */
export function phraseBouclier(titreBloc: string | null, finMinute: number): string {
  const fin = `until ${enHeure(finMinute)}`
  return titreBloc ? `${titreBloc} — ${fin}` : `Set aside ${fin}`
}

/**
 * Quel titre le bouclier doit porter, entre celui qu'on passe et celui qu'on
 * avait retenu.
 *
 * Trois cas, et ils ne se confondent pas : un titre donné remplace, `null`
 * efface volontairement, et `undefined` veut dire « ne touche pas ». Cette
 * troisième valeur existe pour le repose d'apparence, qui connaît le thème
 * mais pas le bloc — sans elle, basculer en sombre pendant une séance
 * remplaçait « Chemistry — until 15:30 » par une phrase sans nom. Le défaut
 * aurait été invisible depuis l'application : on ne voit ce bouclier qu'en
 * ouvrant ce qu'on a écarté.
 */
export function titrePourBouclier(
  passe: string | null | undefined,
  memorise: string | null,
): string | null {
  return passe === undefined ? memorise : passe
}

/**
 * L'habillage complet, prêt à être déposé pour l'extension.
 *
 * Le thème est BAKÉ : l'extension n'a aucun moyen de lire le nôtre, et les
 * couleurs d'UIKit sont fixes. On le repose donc à chaque séance ouverte et à
 * chaque bascule d'apparence — c'est une écriture, pas un calcul.
 */
export function habillageBouclier(args: {
  theme: NomTheme
  titreBloc: string | null
  finMinute: number
  /** Mode profond : tout est écarté sauf la liste gardée. Change la sortie. */
  profond?: boolean
}): { configuration: ConfigurationBouclier; actions: ActionsBouclier } {
  const j: Jetons = THEMES[args.theme]
  const sortie = sortieDuBouclier(args.profond ?? false)

  return {
    configuration: {
      backgroundColor: versCouleurIOS(j.bg),
      title: NOM_APPLICATION,
      titleColor: versCouleurIOS(j.text),
      subtitle: phraseBouclier(args.titreBloc, args.finMinute),
      subtitleColor: versCouleurIOS(j.text2),
      // Le sablier plutôt qu'un cadenas : Vethos écarte pour la durée d'une
      // séance, il n'enferme pas. Un cadenas promettrait une serrure que
      // personne ne possède — l'autorisation se retire depuis les Réglages.
      iconSystemName: 'hourglass',
      iconTint: versCouleurIOS(j.accentEncre),
      primaryButtonLabel: 'Close',
      primaryButtonLabelColor: versCouleurIOS(j.accentSur),
      primaryButtonBackgroundColor: versCouleurIOS(j.accent),
      secondaryButtonLabel: sortie.libelle,
      secondaryButtonLabelColor: versCouleurIOS(j.text3),
    },
    actions: {
      // Fermer renvoie à l'écran d'accueil : c'est ce que l'utilisateur attend
      // d'un bouton qui dit « Close », et ça ne coûte rien à défaire.
      primary: { behavior: 'close' },
      secondary: sortie.action,
    },
  }
}

/**
 * La porte de sortie, et pourquoi elle n'est pas la même dans les deux modes.
 *
 * L'utilisateur peut tout lever quand il veut : c'est assumé, et l'écran
 * Blocage le dit. Reste à choisir PAR OÙ.
 *
 * En mode normal, la sortie passe par l'application : lever depuis le bouclier
 * ferait de l'abandon le geste le plus court du produit, alors qu'ouvrir
 * Vethos montre d'abord ce qui tourne et laisse lever juste derrière. La
 * sortie est éclairée, pas réflexe.
 *
 * En mode profond, ce raisonnement s'effondre — et c'est une contrainte
 * technique, pas un choix. `enableBlockAllMode` écarte TOUTES les catégories
 * sauf la liste gardée, et cette liste ne se remplit que dans le sélecteur
 * d'Apple : Vethos n'a aucun moyen de s'y ajouter lui-même, faute de pouvoir
 * fabriquer son propre jeton. Si l'utilisateur ne s'est pas gardé Vethos,
 * « Open Vethos » ouvre un bouclier. La sortie doit donc agir SANS
 * l'application, depuis l'extension elle-même.
 */
function sortieDuBouclier(profond: boolean): { libelle: string; action: ActionBouclier } {
  if (profond) {
    return {
      libelle: 'Lift deep focus',
      action: { behavior: 'close', actions: [{ type: 'disableBlockAllMode' }] },
    }
  }
  return {
    libelle: 'Open Vethos',
    action: { behavior: 'close', actions: [{ type: 'openApp' }] },
  }
}

/**
 * Le schéma d'URL par lequel le bouclier rouvre Vethos.
 *
 * **Il n'est pas de notre choix.** L'action `openApp` est exécutée par
 * l'extension d'Apple, dans son processus, et elle ouvre une adresse écrite
 * en dur dans le greffon : `device-activity://`. Il n'existe aucun réglage
 * pour la changer — la source porte un `// todo` à cet endroit précis.
 *
 * Vethos répond donc AUSSI à ce schéma (`app.json`, champ `scheme`). Sans
 * cette deuxième entrée, le bouton « Open Vethos » du bouclier ne ferait
 * rien du tout : iOS ne résoudrait l'adresse vers aucune application, sans
 * erreur, sans trace, et sans que rien dans Vethos puisse s'en apercevoir.
 *
 * C'est exactement le genre de ligne qu'un nettoyage de configuration
 * supprime — d'où le test qui l'épingle juste à côté de celui du bouton.
 */
export const SCHEMA_RETOUR = 'device-activity'
