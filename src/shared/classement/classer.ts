/**
 * Classement d'une application : de quelles ACTIVITÉS humaines relève-t-elle ?
 *
 * Trois principes, tirés de tout ce qui a échoué avant :
 *
 *  1. On classe sur des PREUVES, jamais sur un nom. « Torrex » ne dit rien ;
 *     « ouvre .torrent » dit tout.
 *  2. Chaque fiche porte le NIVEAU de preuve qui l'a produite. Une déduction ne se
 *     déguise jamais en certitude.
 *  3. Une application dont on ne sait rien est INCONNUE, et une application inconnue
 *     n'est JAMAIS bloquée. Ne pas savoir n'est pas une raison de punir — c'est ce
 *     qui a bloqué 150 applications quand l'utilisateur voulait jouer.
 */

import { EXTENSION_VERS_ACTIVITES, PROTOCOLE_VERS_ACTIVITES } from './associations'

/** Ce que la machine a pu établir sur une application, avant tout classement. */
export interface PreuvesApplication {
  nom: string
  /** Types de fichiers que Windows lui associe. */
  extensions: readonly string[]
  /** Protocoles d'URL qu'elle déclare savoir traiter. */
  protocoles: readonly string[]
  /** Installée dans une bibliothèque de jeux, ou déclarée par un magasin de jeux. */
  dansDossierJeu: boolean
  /** Nombre d'autres programmes installés sous son dossier. */
  programmesHeberges: number
  /** L'utilisateur peut-elle la lancer : raccourci, protocole, association, jeu. */
  lancable: boolean
  /**
   * Le dossier embarque un pilote noyau : fichier `.sys`, ou co-installateur du
   * Windows Driver Framework. Un logiciel qui installe un pilote pilote du matériel —
   * c'est une preuve de structure, pas une lecture de texte.
   */
  piloteEmbarque?: boolean
}

export type NiveauClassement = 'PROUVE' | 'DEDUIT' | 'INCONNU' | 'NEUTRE'

export interface Classement {
  activites: string[]
  niveau: NiveauClassement
  justifications: string[]
  /** Une application non bloquable ne peut jamais être refusée à l'utilisateur. */
  bloquable: boolean
}

/**
 * Classe une application à partir des seules preuves locales.
 *
 * Ne consulte aucun réseau, n'appelle aucun modèle. Ce qui n'est pas prouvé ici
 * reste INCONNU et sera soumis plus tard à une source extérieure — sous réserve de
 * vérification.
 */
/**
 * Mots qui désignent une PIÈCE D'INFRASTRUCTURE et non une application : un
 * redistribuable, un runtime, un installateur.
 *
 * On ne juge pas ici de l'identité d'un produit — seulement de sa nature. « Microsoft
 * Visual C++ 2015-2022 Redistributable » n'est pas quelque chose que l'on ouvre, et
 * « Visual Studio Setup » est le programme qui installe, pas celui qu'on utilise.
 * Les compter comme des applications inconnues faussait la mesure.
 */
const INFRASTRUCTURE = /\b(redistributable|runtime|setup|installer|prerequisites?|sdk|driver pack|codec pack)\b/i

export function classer(p: PreuvesApplication): Classement {
  if (INFRASTRUCTURE.test(p.nom)) {
    return {
      activites: [],
      niveau: 'NEUTRE',
      justifications: ["pièce d'infrastructure : redistribuable, runtime ou installateur, pas une application"],
      bloquable: false,
    }
  }

  // Ce qui ne se lance pas n'est pas une application : pilote, service, composant.
  // On ne le classe pas et on ne le bloque jamais.
  if (!p.lancable) {
    return {
      activites: [],
      niveau: 'NEUTRE',
      justifications: ["ne peut pas être lancée par l'utilisateur : composant, pilote ou service"],
      bloquable: false,
    }
  }

  const activites = new Set<string>()
  const justifications: string[] = []

  // --- Preuve : les types de fichiers qu'elle sait ouvrir ---
  const parActivite = new Map<string, string[]>()
  for (const ext of p.extensions) {
    const cibles = EXTENSION_VERS_ACTIVITES[String(ext).toLowerCase()]
    if (!cibles) continue
    for (const a of cibles) {
      activites.add(a)
      if (!parActivite.has(a)) parActivite.set(a, [])
      parActivite.get(a)!.push(ext)
    }
  }
  for (const [a, exts] of parActivite) {
    justifications.push(`${a}: opens ${exts.slice(0, 5).join(' ')}`)
  }

  // --- Preuve : les protocoles qu'elle déclare ---
  for (const prot of p.protocoles) {
    const cibles = PROTOCOLE_VERS_ACTIVITES[String(prot).toLowerCase()]
    if (!cibles) continue
    for (const a of cibles) activites.add(a)
    justifications.push(`${cibles.join(', ')}: declares the ${prot}:// protocol`)
  }

  // --- Preuve : installée dans une bibliothèque de jeux ---
  if (p.dansDossierJeu) {
    activites.add('JOUER')
    justifications.push('JOUER: installed in a games library')
  }

  // --- Preuve : embarque un pilote noyau ---
  // Un `.sys` ou un co-installateur WDF dans le dossier veut dire que le produit
  // installe du matériel. Mesuré le 2026-09-17 : « PC Remote Receiver » ne dit nulle
  // part ce qu'il fait, mais livre `driververifyx64` et `WdfCoinstaller01009`.
  if (p.piloteEmbarque) {
    activites.add('CONFIGURER_UN_PERIPHERIQUE')
    justifications.push('CONFIGURER_UN_PERIPHERIQUE: installs a device driver')
  }

  // --- Preuve : héberge d'autres programmes ---
  // Un hôte lance ce qu'il héberge. Associé à un protocole de jeu, c'est un
  // lanceur de jeux ; seul, cela reste une gestion de logiciels.
  if (p.programmesHeberges >= 2) {
    if (activites.has('JOUER')) {
      activites.add('GERER_SA_LUDOTHEQUE')
      justifications.push(`GERER_SA_LUDOTHEQUE: hosts ${p.programmesHeberges} programs`)
    } else {
      activites.add('INSTALLER_UN_LOGICIEL')
      justifications.push(`INSTALLER_UN_LOGICIEL: hosts ${p.programmesHeberges} programs`)
    }
  }

  if (activites.size === 0) {
    return {
      activites: [],
      niveau: 'INCONNU',
      justifications: ['no local evidence: no file association, no protocol, no telling location'],
      // Règle d'or : ne pas savoir n'autorise pas à bloquer.
      bloquable: false,
    }
  }

  return {
    activites: [...activites].sort(),
    niveau: 'PROUVE',
    justifications,
    bloquable: true,
  }
}
