/**
 * Assemblage du catalogue : de l'inventaire brut à des fiches classées.
 *
 * Toute la chaîne, dans l'ordre où la confiance décroît :
 *
 *   1. IDENTITÉ   — titre officiel du Magasin (PFN), manifeste Steam, identifiant
 *                   canonique winget, puis ProductName du binaire, puis registre.
 *   2. LANÇABLE   — l'utilisateur peut-il l'ouvrir ? Sinon la fiche est NEUTRE.
 *   3. CLASSEMENT — activités déduites des associations de fichiers, des protocoles
 *                   et de l'emplacement. Aucun réseau, aucun modèle.
 *
 * Ce qui reste INCONNU après cette chaîne n'est jamais bloqué.
 */

import { classer, type Classement } from '@shared/classement/classer'
import { classerParDescription } from '@shared/classement/description'

export interface EntreeInventaire {
  nomRegistre: string | null
  /** Clé de désinstallation : la marque d'un produit installé pour lui-même. */
  cleRegistre?: string | null
  ruche: string
  editeurDeclare: string | null
  version: string | null
  emplacement: string | null
  identitePaquet: string | null
  steamAppId: string | null
  steamNom: string | null
  preuves: {
    exeAnalyse: string | null
    editeurBinaire: string | null
    produitBinaire: string | null
    /** Texte écrit par l'éditeur dans le binaire : « 7-Zip File Manager », « Python ». */
    descriptionBinaire?: string | null
    signature: string
    nbFichiers: number
    /**
     * Le reste de la ressource VERSIONINFO. On ne lisait que quatre champs sur onze.
     * « AMD Settings » ne dit nulle part ce qu'il fait — sauf dans sa version, qui
     * annonce « AMD-Radeon-Driver/drivers ».
     */
    commentaires?: string | null
    marqueDeposee?: string | null
    versionProduit?: string | null
    nomInterne?: string | null
    /** Noms des exécutables et bibliothèques voisins. */
    voisinage?: readonly string[]
    /** Le dossier embarque un pilote noyau (.sys ou co-installateur WDF). */
    piloteEmbarque?: boolean
  }
}

export interface SourcesExternes {
  /** PFN -> titre officiel du Magasin Windows. */
  titresStore: ReadonlyMap<string, string>
  /**
   * PFN -> description écrite par l'éditeur sur sa fiche du Magasin.
   * Le PFN étant la même clé des deux côtés, c'est une correspondance décisive :
   * aucune confusion de produit n'est possible.
   */
  descriptionsStore: ReadonlyMap<string, { description: string | null; etiquettes: readonly string[] }>
  /** nom normalisé -> identifiant canonique winget. */
  identifiantsWinget: ReadonlyMap<string, string>
  /** nom d'exécutable -> protocoles déclarés. */
  protocolesParExe: ReadonlyMap<string, readonly string[]>
  /** nom d'exécutable -> extensions associées. */
  extensionsParExe: ReadonlyMap<string, readonly string[]>
  /**
   * Dossier (en minuscules) -> protocoles et extensions déclarés par N'IMPORTE quel
   * exécutable qui s'y trouve.
   *
   * Nécessaire parce que les associations ne sont presque jamais posées sur le binaire
   * principal : Python associe `.py` à `py.exe` et non à `python.exe`, itch déclare
   * `itch://` depuis un exécutable voisin, et Microsoft Office répartit ses 82
   * associations entre Word, Excel, Outlook et OneNote.
   */
  protocolesParDossier: ReadonlyMap<string, readonly string[]>
  extensionsParDossier: ReadonlyMap<string, readonly string[]>
  /**
   * Identifiant canonique -> description officielle écrite par l'éditeur.
   * Sert de dernier recours pour les applications qui ne déclarent rien à Windows :
   * PyCharm, Node.js, qBittorrent et OBS Studio n'annoncent ni type de fichier ni
   * protocole, mais leur éditeur dit ce qu'elles font.
   */
  descriptions: ReadonlyMap<string, { description: string | null; etiquettes: readonly string[] }>
  /**
   * Emplacement -> fiche extérieure CONFIRMÉE par le vérificateur.
   *
   * Réservé aux applications dont ni la machine ni l'identifiant canonique ne
   * disaient rien. Le candidat n'entre ici qu'après avoir résisté à la confrontation
   * avec l'éditeur, la version et le nom d'exécutable inscrits dans le binaire.
   */
  resolutionsConfirmees: ReadonlyMap<string, { id: string; description: string | null; etiquettes: readonly string[] }>
}

/**
 * Réunit tout ce qui est déclaré par un exécutable situé dans ce dossier OU dans
 * l'un de ses sous-dossiers.
 *
 * La comparaison de chemins exacts ne suffisait pas : Microsoft Office s'installe
 * dans `\Microsoft Office` mais pose ses 82 associations depuis `\root\Office16\`.
 */
function declaréSousLeDossier(index: ReadonlyMap<string, readonly string[]>, dossier: string): string[] {
  if (!dossier) return []
  const prefixe = dossier + '\\'
  const out: string[] = []
  for (const [d, valeurs] of index) {
    if (d === dossier || d.startsWith(prefixe)) out.push(...valeurs)
  }
  return out
}

export interface FicheApplication {
  nom: string
  sourceDuNom: string
  emplacement: string | null
  editeur: string | null
  identifiants: { store: string | null; winget: string | null; steam: string | null }
  classement: Classement
}

const GENERIQUE = /windows.{0,3} operating system|^microsoft.{0,3} windows/i

/**
 * Segments de chemin qui désignent l'INTÉRIEUR d'un produit, et non un produit.
 *
 * C'est le discriminant qui évite la catastrophe inverse. Mesuré le 2026-09-17 :
 * cinq jeux Steam ont `Steam` pour dossier parent, et tous les outils de Windows ont
 * `C:\Windows`. Absorber un enfant sur la seule imbrication des chemins aurait fait
 * disparaître les jeux de l'utilisateur dans leur lanceur — le défaut d'origine sous
 * un autre costume.
 *
 * Or `steamapps\common\<jeu>` et `C:\Windows\System32` ne contiennent aucun de ces
 * segments, tandis que `...\Launcher\Engine\Binaries\Win64` et
 * `...\managedArtifacts\<empreinte>` en contiennent : les premiers restent des fiches
 * à part entière, les seconds sont reconnus pour ce qu'ils sont — des morceaux.
 */
const CHEMIN_DE_COMPOSANT = /\\(binaries|managedartifacts|engine|plugins?|resources|node_modules|[0-9a-f]{16,})\\/

/**
 * Dossiers partagés : ils CONTIENNENT des produits, ils n'en sont pas un.
 *
 * Réunir ce que déclarent tous les exécutables d'un dossier est juste pour un produit
 * installé chez lui — Microsoft Office pose ses 82 associations depuis `\root\Office16`.
 * Appliqué à `C:\Windows\System32`, le même balayage ramasse les associations de TOUT
 * le système : mesuré le 2026-09-17, l'Éditeur du Registre se retrouvait à « naviguer
 * sur le web », « écrire du code » et « installer un logiciel ».
 *
 * Pour ces dossiers, seul ce que déclare le binaire lui-même est retenu.
 */
const DOSSIER_PARTAGE =
  /^[a-z]:\\(windows|windows\\system32|windows\\syswow64|program files|program files \(x86\)|programdata)$|\\appdata\\(local|roaming)$|\\appdata\\local\\programs$|\\\.local\\bin$/

/**
 * Index des identifiants canoniques winget, par nom normalisé.
 *
 * Trois clés par identifiant, du plus précis au plus général :
 *   - le nom rapporté par winget — « PyCharm Community Edition 2025.3.3 » ;
 *   - la partie produit complète  — `JetBrains.PyCharm` donne `id:pycharm` ;
 *   - le SEUL deuxième segment    — `Python.Python.3.14` donne `id:python`.
 *
 * La troisième clé est indispensable : l'application s'annonce « Python », alors que
 * son identifiant porte la version. Sans elle, une description officielle disponible
 * restait inutilisée.
 *
 * Elle n'est posée que si elle désigne UN SEUL produit. `Microsoft.VisualStudio.Community`
 * et `Microsoft.VisualStudio.BuildTools` revendiquent tous deux « visualstudio » sans
 * être le même logiciel : la clé est alors abandonnée plutôt que tranchée au hasard.
 * Les segments de version ne comptent pas dans la comparaison, si bien que
 * `Python.Python.3.12` et `Python.Python.3.14` restent un seul produit.
 */
export function indexerIdentifiantsWinget(
  liste: ReadonlyArray<{ nom: string; id: string; forme: string }>,
): Map<string, string> {
  const canoniques = liste.filter((w) => w.forme === 'CANONIQUE')
  const estVersion = (s: string) => /^\d+(\.\d+)*$/.test(s)
  const sansVersion = (id: string) => id.split('.').filter((s) => !estVersion(s)).join('.')

  const m = new Map<string, string>()
  for (const w of canoniques) {
    const parNom = normaliser(w.nom)
    if (parNom && !m.has(parNom)) m.set(parNom, w.id)
    const produit = w.id.includes('.') ? w.id.slice(w.id.indexOf('.') + 1) : w.id
    const cle = 'id:' + normaliser(produit)
    if (!m.has(cle)) m.set(cle, w.id)
  }

  // Deuxième segment seul, et seulement quand il ne désigne qu'un produit.
  const parSegment = new Map<string, Set<string>>()
  for (const w of canoniques) {
    const segments = w.id.split('.')
    if (segments.length < 2) continue
    const cle = 'id:' + normaliser(segments[1])
    if (!cle || m.has(cle)) continue
    if (!parSegment.has(cle)) parSegment.set(cle, new Set())
    parSegment.get(cle)!.add(sansVersion(w.id))
  }
  for (const [cle, produits] of parSegment) {
    if (produits.size !== 1) continue
    const gagnant = canoniques.find((w) => sansVersion(w.id) === [...produits][0])
    if (gagnant) m.set(cle, gagnant.id)
  }
  return m
}

export const normaliser = (s: string | null | undefined): string =>
  String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')

/**
 * Le dernier segment d'un chemin d'installation. Un dossier partagé ne dit rien du
 * produit, on n'en retourne donc rien.
 */
const nomDuDossier = (chemin: string | null): string | null => {
  const s = String(chemin || '').replace(/\\+$/, '')
  if (!s || DOSSIER_PARTAGE.test(s.toLowerCase())) return null
  const i = s.lastIndexOf('\\')
  const seg = i >= 0 ? s.slice(i + 1) : s
  return seg.length >= 3 ? seg : null
}

const nomDeFichier = (chemin: string | null): string => {
  const s = String(chemin || '')
  const i = Math.max(s.lastIndexOf('\\'), s.lastIndexOf('/'))
  return (i >= 0 ? s.slice(i + 1) : s).toLowerCase()
}

/**
 * Noms d'outillage. Un raccourci du menu Démarrer porte parfois le nom d'un composant
 * au lieu de celui du produit : mesuré le 2026-09-17, un raccourci « UnityCrashHandler64 »
 * désignait en réalité `Gunsaw.exe`. Le nom de l'exécutable analysé vaut alors mieux.
 *
 * « Launcher » n'y figure pas : Epic Games Launcher et Rockstar Games Launcher sont de
 * vraies applications que l'utilisateur ouvre lui-même.
 */
const OUTILLAGE = /crash(handler|pad)|webhelper|overlayrenderer|^unins\d*$|^setup$|^installer?$|^updater?$/i

/**
 * Un ™ ou un ® perdu à l'encodage laisse un résidu dans le nom :
 *
 *   « Battlefield™ 6 »               devient  « Battlefield<FFFD>,<FFFD> 6 »
 *   « Horizon Forbidden West™ CE »   devient  « Horizon Forbidden WestT CE »
 *
 * On retire le résidu au lieu de tenter de restituer le symbole : l'information est
 * perdue au décodage, et un nom propre vaut mieux qu'un nom faux. La lettre isolée
 * n'est enlevée qu'après un mot d'au moins trois minuscules, ce qui laisse intact
 * « ChatGPT », « BitTorrent » ou « qBittorrent ».
 */
function nettoyerNom(s: string): string {
  return String(s || '')
    .replace(/�[\s,.;·]*�?/g, ' ')
    .replace(/�/g, '')
    .replace(/([a-z]{3,})[TR]\b/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** Le nom le plus fiable disponible, et d'où il vient. */
function meilleurNom(e: EntreeInventaire, ext: SourcesExternes): { nom: string; source: string } {
  if (e.identitePaquet) {
    const t = ext.titresStore.get(e.identitePaquet)
    // Le PFN est la même clé des deux côtés : la correspondance est décisive.
    if (t) return { nom: nettoyerNom(t), source: 'Magasin Windows (identité de paquet)' }
  }
  // Le manifeste Steam porte le titre commercial, ™ compris — et le ™ ne survit pas
  // toujours au décodage du fichier. Il passe donc par le nettoyage comme les autres.
  if (e.steamNom) return { nom: nettoyerNom(e.steamNom), source: 'manifeste Steam' }

  const brutProduit = String(e.preuves.produitBinaire || '')
  const registre = nettoyerNom(e.nomRegistre || '')

  // Un ProductName abîmé par l'encodage — « Microsoftr Visual Studior » — est pire
  // qu'inutile : il empêche tout appariement ultérieur. Le registre prend alors le pas.
  // Le symbole ® perdu à l'encodage laisse un « r » collé au mot précédent :
  // « Microsoft® Visual Studio® » devient « Microsoftr Visual Studior ».
  const abime = /�/.test(brutProduit) || /[a-z]r [A-Z]/.test(brutProduit) || /[a-z]{4,}r$/.test(brutProduit)
  const produit = nettoyerNom(brutProduit)

  const choisi =
    produit && !GENERIQUE.test(produit) && !(abime && registre)
      ? { nom: produit, source: 'ProductName du binaire' }
      : registre
        ? { nom: registre, source: 'registre Windows' }
        : produit
          ? { nom: produit, source: 'ProductName du binaire' }
          : { nom: '', source: 'aucune' }

  // Le nom retenu désigne un composant, alors que l'exécutable analysé désigne le
  // produit : on préfère ce dernier. C'est ainsi qu'un raccourci nommé
  // « UnityCrashHandler64 » redevient le jeu « Gunsaw » qu'il pointait.
  if (choisi.nom && OUTILLAGE.test(choisi.nom)) {
    // On garde la casse d'origine : c'est un nom montré à l'utilisateur.
    const chemin = String(e.preuves.exeAnalyse || '')
    const i = Math.max(chemin.lastIndexOf('\\'), chemin.lastIndexOf('/'))
    const exe = (i >= 0 ? chemin.slice(i + 1) : chemin).replace(/\.exe$/i, '')
    if (exe && !OUTILLAGE.test(exe)) {
      return { nom: nettoyerNom(exe), source: "nom de l'exécutable analysé" }
    }
  }
  return choisi
}

/**
 * Construit les fiches. `emplacementsConnus` sert à détecter les applications qui
 * en hébergent d'autres — un lanceur se reconnaît à ce qu'il abrite.
 */
export function construireCatalogue(
  inventaire: readonly EntreeInventaire[],
  ext: SourcesExternes,
): FicheApplication[] {
  const analysables = inventaire.filter((e) => e.preuves.nbFichiers > 0)
  const emplacements = analysables.map((e) => String(e.emplacement || '').toLowerCase().replace(/\\+$/, ''))

  /**
   * Un produit déclaré au registre nomme tout son arbre de dossiers.
   *
   * Mesuré le 2026-09-17 : l'entrée de désinstallation « Visual Studio Community 2026 »
   * portait l'identité mais aucun moyen d'être ouverte, tandis que `...\Common7\IDE`
   * portait le raccourci du menu Démarrer sans rien savoir de son propre nom. Ce sont
   * les deux faces d'un même produit ; l'un des deux sait ce qu'il est.
   */
  const identitesParDossier = analysables
    .filter((x) => x.nomRegistre && x.emplacement)
    .map((x) => ({
      dossier: String(x.emplacement).toLowerCase().replace(/\\+$/, ''),
      nom: String(x.nomRegistre),
      editeur: String(x.preuves.editeurBinaire || x.editeurDeclare || ''),
    }))
    .filter((x) => x.dossier && !DOSSIER_PARTAGE.test(x.dossier))
    .sort((a, b) => b.dossier.length - a.dossier.length)

  /**
   * L'identifiant canonique du produit qui possède ce dossier, s'il y en a un — et
   * si rien ne contredit la parenté.
   *
   * Le garde-fou n'est pas théorique. L'entrée de désinstallation de 7-Zip annonce
   * sur cette machine un emplacement qui appartient à AMD ; sans cette vérification,
   * 7-Zip héritait de la fiche d'AMD et se retrouvait classé « dialoguer avec une IA ».
   * Deux éditeurs qui ne se recouvrent pas suffisent à rompre le lien.
   */
  const identifiantParAncetre = (chemin: string, editeur: string): string | null => {
    const mien = normaliser(editeur)
    for (const a of identitesParDossier) {
      if (chemin === a.dossier || !chemin.startsWith(a.dossier + '\\')) continue
      const sien = normaliser(a.editeur)
      if (mien && sien && !mien.includes(sien) && !sien.includes(mien)) continue
      const id =
        ext.identifiantsWinget.get(normaliser(a.nom)) || ext.identifiantsWinget.get('id:' + normaliser(a.nom))
      if (id) return id
    }
    return null
  }

  const fiches: FicheApplication[] = []
  const identites = new Map<FicheApplication, boolean>()
  for (const e of analysables) {
    const exe = nomDeFichier(e.preuves.exeAnalyse)
    const moi = String(e.emplacement || '').toLowerCase().replace(/\\+$/, '')

    // On réunit ce que déclare le binaire principal ET ce que déclare tout
    // exécutable situé sous le dossier de l'application — sauf si ce « dossier » est
    // en réalité un dossier partagé, auquel cas seul le binaire compte.
    const partage = DOSSIER_PARTAGE.test(moi)
    const sousLeDossier = (index: ReadonlyMap<string, readonly string[]>) =>
      partage ? [] : declaréSousLeDossier(index, moi)
    const protocoles = [
      ...new Set([...(ext.protocolesParExe.get(exe) || []), ...sousLeDossier(ext.protocolesParDossier)]),
    ]
    const extensions = [
      ...new Set([...(ext.extensionsParExe.get(exe) || []), ...sousLeDossier(ext.extensionsParDossier)]),
    ]

    // Un dossier partagé héberge tout le système : le compter comme un hôte ferait
    // passer `C:\Windows` pour un lanceur d'applications.
    const heberges =
      moi && !partage ? emplacements.filter((x) => x !== moi && x.startsWith(moi + '\\')).length : 0
    const emp = String(e.emplacement || '').toLowerCase()
    const dansDossierJeu = Boolean(e.steamAppId) || /steamapps|epic games|\\games\\|gog galaxy/.test(emp)

    // `SystemApps` abrite les morceaux de l'interface de Windows — ils n'ont ni
    // raccourci ni fenêtre propre, et ne sont donc pas des applications.
    const composantSysteme = /\\systemapps\\/.test(emp)

    // Lançable : l'utilisateur peut l'ouvrir. Une entrée de désinstallation seule ne
    // suffit pas — ce critère laissait entrer pilotes, couches matérielles et services.
    const lancable =
      !composantSysteme &&
      (dansDossierJeu ||
        e.ruche.includes('MENU_DEMARRER') ||
        protocoles.length > 0 ||
        extensions.length > 0)

    const { nom, source } = meilleurNom(e, ext)
    let classement = classer({
      nom,
      extensions,
      protocoles,
      dansDossierJeu,
      programmesHeberges: heberges,
      lancable,
      // Jamais dans un dossier partagé : `C:\Windows\System32` déborde de fichiers
      // `.sys` qui n'appartiennent à aucune des applications qui y résident. Sans
      // cette réserve, l'Éditeur du Registre et la Connexion Bureau à distance
      // « installaient un pilote ».
      piloteEmbarque: !partage && Boolean(e.preuves.piloteEmbarque),
    })

    const idWinget =
      ext.identifiantsWinget.get(normaliser(nom)) ||
      ext.identifiantsWinget.get(normaliser(e.nomRegistre)) ||
      // Le nom rapporté par winget porte souvent une édition et une version —
      // « PyCharm Community Edition 2025.3.3 » — que le nom du binaire n'a pas.
      // La partie produit de l'identifiant, elle, est stable : « JetBrains.PyCharm ».
      ext.identifiantsWinget.get('id:' + normaliser(nom)) ||
      ext.identifiantsWinget.get('id:' + normaliser(e.nomRegistre)) ||
      // Enfin, le produit qui possède le dossier — il connaît son nom canonique.
      identifiantParAncetre(moi, e.preuves.editeurBinaire || e.editeurDeclare || '') ||
      null

    // Repli : la description officielle, quand la machine ne déclare rien. Le niveau
    // reste DEDUIT — un texte d'éditeur est du marketing autant que de la technique,
    // il ne vaut pas une association de types de fichiers.
    if (classement.niveau === 'INCONNU') {
      // Trois textes officiels, du plus riche au plus bref :
      //   1. la description du paquet canonique,
      //   2. celle d'un candidat trouvé par recherche ET confirmé,
      //   3. la FileDescription inscrite dans le binaire par l'éditeur.
      // La troisième est locale et gratuite, et souvent la seule disponible pour les
      // outils qui ne figurent dans aucun dépôt : « 7-Zip File Manager » suffit à dire
      // ce que fait le produit.
      const fiche = (idWinget ? ext.descriptions.get(idWinget) : null) || ext.resolutionsConfirmees.get(moi)
      const store = e.identitePaquet ? ext.descriptionsStore.get(e.identitePaquet) : null
      const textes: Array<{ texte: string | null; etiquettes: readonly string[]; origine: string }> = [
        // Le Magasin d'abord : l'identité de paquet rend la correspondance décisive.
        { texte: store ? store.description : null, etiquettes: store ? store.etiquettes : [], origine: 'fiche du Magasin Windows' },
        { texte: fiche ? fiche.description : null, etiquettes: fiche ? fiche.etiquettes : [], origine: 'description officielle' },
        { texte: e.preuves.descriptionBinaire || null, etiquettes: [], origine: 'description inscrite dans le binaire' },
        // Le reste de la ressource VERSIONINFO, réuni en un seul texte. C'est le
        // dernier endroit où l'éditeur parle de son produit sans faire de marketing.
        {
          texte: [e.preuves.commentaires, e.preuves.versionProduit, e.preuves.marqueDeposee, e.preuves.nomInterne]
            .filter(Boolean)
            .join(' ') || null,
          etiquettes: [],
          origine: 'ressource de version du binaire',
        },
        // Dernier recours : le nom du dossier d'installation, écrit lui aussi par
        // l'éditeur. C'est parfois le seul texte disponible — le binaire `wpa.exe`
        // ne dit que « wpa », quand son dossier annonce « Windows Performance Toolkit ».
        { texte: nomDuDossier(e.emplacement), etiquettes: [], origine: "nom du dossier d'installation" },
      ]

      for (const t of textes) {
        if (!t.texte && t.etiquettes.length === 0) continue
        const parTexte = classerParDescription(t.texte, t.etiquettes)
        if (parTexte.activites.length === 0) continue
        classement = {
          activites: parTexte.activites,
          niveau: 'DEDUIT',
          justifications: parTexte.justifications,
          bloquable: true,
        }
        break
      }
    }

    // Ce qui rend une fiche indépendante de son dossier parent, c'est une IDENTITÉ
    // propre — jamais une association. Un protocole déclaré depuis un sous-dossier
    // remonte de toute façon au parent : le compter comme preuve d'indépendance
    // laissait « EpicWebHelper » et le dossier `Portal\Binaries\Win64` passer pour
    // deux produits distincts, alors qu'ils déclarent le protocole du lanceur qui
    // les contient.
    const identitePropre =
      Boolean(e.identitePaquet || e.steamAppId || e.cleRegistre) || heberges > 0

    const fiche: FicheApplication = {
      nom,
      sourceDuNom: source,
      emplacement: e.emplacement,
      editeur: e.preuves.editeurBinaire || e.editeurDeclare || null,
      identifiants: {
        store: e.identitePaquet ? ext.titresStore.get(e.identitePaquet) ? e.identitePaquet : null : null,
        winget: ext.identifiantsWinget.get(normaliser(nom)) || ext.identifiantsWinget.get(normaliser(e.nomRegistre)) || null,
        steam: e.steamAppId,
      },
      classement,
    }
    fiches.push(fiche)
    identites.set(fiche, identitePropre)
  }

  return fusionnerSousDossiers(fiches, identites)
}

/**
 * Une même application apparaît souvent plusieurs fois : son dossier racine, son
 * sous-dossier `bin`, ses composants internes. Seule la racine porte les preuves ;
 * les autres n'ont rien et se présentaient comme autant d'applications inconnues.
 *
 * Mesuré le 2026-09-17 : « Microsoft Office » figurait trois fois — la racine et
 * `\root\Office16` classées avec neuf activités, et `\root\Client` sans rien, comptée
 * comme une application inconnue de plus.
 *
 * On absorbe donc une fiche dans sa parente lorsqu'elle n'apporte AUCUNE preuve
 * propre. Une fiche qui a ses propres associations reste autonome : deux vrais
 * produits peuvent cohabiter sous un même dossier d'éditeur.
 */
function fusionnerSousDossiers(
  fiches: readonly FicheApplication[],
  identites: ReadonlyMap<FicheApplication, boolean>,
): FicheApplication[] {
  const cle = (f: FicheApplication) => String(f.emplacement || '').toLowerCase().replace(/\\+$/, '')
  const parLongueur = [...fiches].sort((a, b) => cle(a).length - cle(b).length)

  const absorbees = new Set<FicheApplication>()
  for (const enfant of parLongueur) {
    const cEnfant = cle(enfant)
    if (!cEnfant) continue

    // Deux raisons d'absorber, et une seule suffit :
    //   1. la fiche ne prouve rien du tout — c'est un morceau de son parent ;
    //   2. elle ne « prouve » que par son emplacement, et son chemin la désigne
    //      comme un composant interne.
    const sansClassement = enfant.classement.niveau !== 'PROUVE' && enfant.classement.niveau !== 'DEDUIT'
    const composant = !identites.get(enfant) && CHEMIN_DE_COMPOSANT.test(cEnfant)
    if (!sansClassement && !composant) continue

    for (const parent of parLongueur) {
      if (parent === enfant || absorbees.has(parent)) continue
      const cParent = cle(parent)
      if (!cParent || cParent.length >= cEnfant.length) continue
      if (!cEnfant.startsWith(cParent + '\\')) continue
      if (parent.classement.niveau !== 'PROUVE' && parent.classement.niveau !== 'DEDUIT') continue
      absorbees.add(enfant)
      break
    }
  }

  const restantes = fiches.filter((f) => !absorbees.has(f))
  return fusionnerHomonymes(restantes)
}

/**
 * Une même application déclarée à plusieurs endroits garde plusieurs fiches :
 * « Python » apparaissait trois fois, « PyCharm » deux fois.
 *
 * Quand des fiches portent le MÊME nom, on n'en conserve qu'une — la mieux classée,
 * car c'est celle qui porte les preuves. Les autres sont le même produit vu depuis
 * un autre chemin, et les compter séparément faussait autant le total que le taux.
 */
function fusionnerHomonymes(fiches: readonly FicheApplication[]): FicheApplication[] {
  const rang = (f: FicheApplication): number =>
    f.classement.niveau === 'PROUVE' ? 3 : f.classement.niveau === 'DEDUIT' ? 2 : f.classement.niveau === 'INCONNU' ? 1 : 0

  const meilleure = new Map<string, FicheApplication>()
  const sansNom: FicheApplication[] = []

  for (const f of fiches) {
    const cle = normaliser(f.nom)
    if (!cle) { sansNom.push(f); continue }
    const actuelle = meilleure.get(cle)
    if (!actuelle) { meilleure.set(cle, f); continue }
    // À rang égal, on garde la fiche au chemin le plus court : la racine du produit.
    const mieux =
      rang(f) > rang(actuelle) ||
      (rang(f) === rang(actuelle) && String(f.emplacement || '').length < String(actuelle.emplacement || '').length)
    if (mieux) meilleure.set(cle, f)
  }

  return [...meilleure.values(), ...sansNom]
}

/** Mesure la couverture : c'est le chiffre qui dit si l'objectif est atteint. */
export function mesurer(fiches: readonly FicheApplication[]) {
  const applications = fiches.filter((f) => f.classement.niveau !== 'NEUTRE')
  const classees = applications.filter((f) => f.classement.niveau === 'PROUVE' || f.classement.niveau === 'DEDUIT')
  const inconnues = applications.filter((f) => f.classement.niveau === 'INCONNU')
  const sansNom = fiches.filter((f) => !f.nom)

  return {
    total: fiches.length,
    neutres: fiches.length - applications.length,
    applications: applications.length,
    classees: classees.length,
    inconnues: inconnues.length,
    sansNom: sansNom.length,
    tauxClassement: applications.length ? Math.round((classees.length / applications.length) * 100) : 0,
    // Aucune fiche ne doit être bloquable sans preuve : c'est l'invariant de sûreté.
    bloquablesSansPreuve: fiches.filter((f) => f.classement.bloquable && f.classement.niveau !== 'PROUVE' && f.classement.niveau !== 'DEDUIT').length,
  }
}
