/**
 * Classement d'après la DESCRIPTION OFFICIELLE écrite par l'éditeur.
 *
 * Dernier recours avant l'inconnu, pour les applications qui ne déclarent ni type
 * de fichier ni protocole : PyCharm, Node.js, qBittorrent, OBS Studio n'annoncent
 * rien à Windows, mais leur éditeur décrit ce qu'elles font.
 *
 * Ce n'est pas une preuve du même rang qu'une association de fichiers : le texte
 * est du marketing autant que de la technique. Le niveau rendu est donc DEDUIT, et
 * jamais PROUVE.
 *
 * Aucun modèle n'intervient : on cherche des expressions précises dans un texte
 * officiel. Un mot vague comme « powerful » ou « fast » ne décide de rien.
 */

/**
 * Expressions recherchées, en anglais parce que c'est la langue des dépôts.
 * Chaque entrée doit être assez spécifique pour ne pas déclencher à tort — « game »
 * seul apparaît dans « game development », d'où les règles d'exclusion plus bas.
 */
const INDICES: ReadonlyArray<{ motifs: readonly string[]; activites: readonly string[] }> = [
  // --- Programmation ---
  { motifs: ['integrated development environment', ' ide ', ' ide.', 'ide with', 'ide for', 'code editor', 'source code', 'programming language', 'compiler', 'debugger', 'javascript runtime', 'python interpreter', 'sdk', 'software development', 'build modern apps', 'build apps', 'develop apps', 'application development'], activites: ['ECRIRE_DU_CODE'] },
  { motifs: ['version control', 'source control', 'git repository'], activites: ['GERER_VERSIONS'] },
  { motifs: ['command line', 'command-line', 'shell', 'terminal emulator', 'scripting'], activites: ['ADMINISTRER_SYSTEME'] },
  // Mots que les éditeurs écrivent eux-mêmes dans leurs outils d'administration.
  // Relevés le 2026-09-17 sur des binaires qui ne déclaraient rien d'autre :
  // « ODBC Administrator », « Registry Editor », « GPU ETW Event Viewer ».
  { motifs: ['administrator', 'registry editor', 'event viewer', 'event trace', 'control panel', 'system monitor', 'task manager', 'device manager'], activites: ['ADMINISTRER_SYSTEME'] },
  // Outillage de développement livré en « kits » et « toolkits ».
  // « Windows App Certification Kit », « Windows Performance Toolkit ».
  { motifs: ['certification kit', 'toolkit', 'debugging tools', 'profiler', 'performance analyzer'], activites: ['ECRIRE_DU_CODE'] },
  { motifs: ['virtual machine', 'containers', 'containerization', 'hypervisor', 'subsystem for linux'], activites: ['VIRTUALISER'] },
  { motifs: ['database management', 'sql server', 'relational database', 'database client'], activites: ['ADMINISTRER_BASE_DONNEES'] },
  { motifs: ['api client', 'rest client', 'http requests'], activites: ['TESTER_UNE_API'] },
  { motifs: ['game engine', 'game development', 'create games', 'build games'], activites: ['CREER_UN_JEU'] },

  // --- Création ---
  { motifs: ['3d modeling', '3d creation', '3d graphics', 'rendering engine', 'sculpting'], activites: ['MODELISER_EN_3D'] },
  { motifs: ['image editor', 'photo editing', 'image manipulation', 'raster graphics', 'retouching'], activites: ['RETOUCHER_UNE_IMAGE'] },
  { motifs: ['vector graphics', 'illustration', 'drawing program'], activites: ['DESSINER'] },
  { motifs: ['video editing', 'video editor', 'non-linear editing'], activites: ['MONTER_UNE_VIDEO'] },
  { motifs: ['live streaming', 'screen recording', 'broadcasting', 'video capture'], activites: ['DIFFUSER_EN_DIRECT'] },
  { motifs: ['digital audio workstation', 'music production', 'audio editing', 'mixing console'], activites: ['PRODUIRE_DE_LA_MUSIQUE'] },
  { motifs: ['desktop publishing', 'page layout'], activites: ['METTRE_EN_PAGE'] },
  { motifs: ['computer-aided design', 'cad software', 'parametric modeling'], activites: ['CONCEVOIR_EN_CAO'] },
  { motifs: ['ui design', 'interface design', 'prototyping tool', 'wireframe'], activites: ['MAQUETTER_UNE_INTERFACE'] },

  // --- Bureautique et écriture ---
  { motifs: ['word processor', 'write documents'], activites: ['REDIGER_UN_DOCUMENT'] },
  { motifs: ['spreadsheet'], activites: ['TRAVAILLER_SUR_TABLEUR'] },
  { motifs: ['presentation software', 'slideshow'], activites: ['PREPARER_UNE_PRESENTATION'] },
  { motifs: ['pdf reader', 'pdf viewer', 'read pdf', 'pdf editor'], activites: ['LIRE_UN_PDF'] },
  { motifs: ['note-taking', 'note taking', 'take notes'], activites: ['PRENDRE_DES_NOTES'] },
  { motifs: ['knowledge base', 'second brain', 'personal knowledge'], activites: ['ORGANISER_DES_CONNAISSANCES'] },
  { motifs: ['text editor', 'plain text'], activites: ['ECRIRE_UN_TEXTE'] },

  // --- Communication ---
  { motifs: ['instant messaging', 'chat app', 'messaging app', 'voice chat'], activites: ['ECHANGER_PAR_MESSAGE'] },
  { motifs: ['video conferencing', 'video meetings', 'online meetings'], activites: ['PARTICIPER_A_UNE_REUNION'] },
  { motifs: ['email client', 'e-mail client', 'mail client'], activites: ['GERER_SES_COURRIELS'] },

  // --- Médias ---
  { motifs: ['media player', 'video player', 'plays videos'], activites: ['REGARDER_UNE_VIDEO'] },
  { motifs: ['music player', 'audio player', 'music streaming', 'listen to music'], activites: ['ECOUTER_DE_LA_MUSIQUE'] },
  { motifs: ['web browser', 'internet browser', 'browse the web'], activites: ['NAVIGUER_SUR_LE_WEB'] },
  { motifs: ['ebook reader', 'e-book', 'read books'], activites: ['LIRE_UN_LIVRE'] },

  // --- Fichiers ---
  { motifs: ['file archiver', 'archive manager', 'compression utility', 'compress files', 'zip files'], activites: ['ARCHIVER'] },
  { motifs: ['bittorrent', 'torrent client', 'download manager', 'downloader'], activites: ['TELECHARGER'] },
  { motifs: ['file synchronization', 'cloud storage', 'backup software', 'file backup'], activites: ['SAUVEGARDER'] },
  { motifs: ['file manager', 'file explorer'], activites: ['ORGANISER_DES_FICHIERS'] },
  { motifs: ['ftp client', 'sftp', 'file transfer'], activites: ['TRANSFERER_DES_FICHIERS'] },

  // --- Machine ---
  { motifs: ['remote desktop', 'remote access', 'remote control software', 'remote receiver', 'remote control'], activites: ['SE_CONNECTER_A_DISTANCE'] },
  { motifs: ['overclocking', 'hardware monitoring', 'system monitoring', 'benchmark', 'frame rate', 'gpu monitoring'], activites: ['SURVEILLER_LES_PERFORMANCES'] },
  { motifs: ['antivirus', 'anti-malware', 'malware protection', 'firewall'], activites: ['SECURISER_LA_MACHINE'] },
  { motifs: ['password manager', 'store passwords'], activites: ['GERER_SES_MOTS_DE_PASSE'] },
  { motifs: ['device driver', 'driver update', 'graphics driver', 'driver removal', 'uninstall .* drivers',
    // Les paquets de pilotes se nomment eux-memes ainsi dans leur ressource de version :
    // « AMD-Radeon-Driver/drivers ». Le tiret evite de confondre avec un mot courant.
    '-driver', 'driver package'], activites: ['CONFIGURER_UN_PERIPHERIQUE'] },
  { motifs: ['package manager', 'install software', 'software installer', 'install manager', 'installation manager'], activites: ['INSTALLER_UN_LOGICIEL'] },

  // --- Intelligence artificielle ---
  { motifs: ['large language model', 'llm', 'ai assistant', 'ai chat', 'run models locally'], activites: ['DIALOGUER_AVEC_UNE_IA'] },

  // Concentration : categorie a laquelle appartient Vethos lui-meme.
  { motifs: ['block distracting', 'block websites', 'stay focused', 'distraction blocker', 'focus on what'], activites: ['BLOQUER_LES_DISTRACTIONS'] },

  // --- Jeu ---
  // Placé en dernier : « game » est le mot le plus piégeux du lot.
  { motifs: ['play games', 'game launcher', 'gaming platform', 'game library'], activites: ['JOUER', 'GERER_SA_LUDOTHEQUE'] },
  // Compagnons de bureau : un personnage animé qui vit à l'écran, avec des succès à
  // débloquer. Ce sont des noms de CATÉGORIE, comme « media player » ou « file
  // archiver » plus haut — pas des noms de produits.
  //
  // `JOUER` est l'activité la plus proche que porte le vocabulaire : il n'existe pas
  // d'entrée « se divertir ». Le traitement, lui, est le bon — autorisé quand on se
  // détend, écarté quand on travaille.
  { motifs: ['virtual pet', 'desktop pet', 'desktop companion', 'desktop mascot', 'tamagotchi'], activites: ['JOUER'] },
]

/**
 * Expressions qui interdisent une activité même si un indice l'a déclenchée.
 * « game development platform » ne doit jamais devenir JOUER.
 */
const EXCLUSIONS: ReadonlyArray<{ activite: string; motifs: readonly string[] }> = [
  { activite: 'JOUER', motifs: ['game development', 'game engine', 'create games', 'build games', 'for developers'] },
  { activite: 'ECOUTER_DE_LA_MUSIQUE', motifs: ['music production', 'audio editing'] },
  { activite: 'REGARDER_UNE_VIDEO', motifs: ['video editing', 'video editor'] },
]

/**
 * Étiquettes posées par l'éditeur sur sa fiche de paquet.
 *
 * Elles sont plus fiables que la prose : ce sont des mots-clés choisis, pas du
 * marketing. PyCharm s'étiquette « programming python development django » alors
 * que sa description dit seulement « The Python & Django IDE » — une tournure qu'un
 * motif de phrase manquait.
 *
 * Un mot d'étiquette ne vaut que s'il est sans ambiguïté : « fast » ou « tool »
 * n'apparaissent pas ici.
 */
const ETIQUETTES: Readonly<Record<string, readonly string[]>> = {
  programming: ['ECRIRE_DU_CODE'], coding: ['ECRIRE_DU_CODE'], developer: ['ECRIRE_DU_CODE'],
  development: ['ECRIRE_DU_CODE'], ide: ['ECRIRE_DU_CODE'], compiler: ['ECRIRE_DU_CODE'],
  python: ['ECRIRE_DU_CODE'], javascript: ['ECRIRE_DU_CODE'], nodejs: ['ECRIRE_DU_CODE'],
  git: ['GERER_VERSIONS'], vcs: ['GERER_VERSIONS'],
  terminal: ['ADMINISTRER_SYSTEME'], shell: ['ADMINISTRER_SYSTEME'], powershell: ['ADMINISTRER_SYSTEME'],
  docker: ['VIRTUALISER'], container: ['VIRTUALISER'], virtualization: ['VIRTUALISER'],
  database: ['ADMINISTRER_BASE_DONNEES'], sql: ['ADMINISTRER_BASE_DONNEES'],
  torrent: ['TELECHARGER'], bittorrent: ['TELECHARGER'], downloader: ['TELECHARGER'],
  archiver: ['ARCHIVER'], compression: ['ARCHIVER'], zip: ['ARCHIVER'], unzip: ['ARCHIVER'],
  streaming: ['DIFFUSER_EN_DIRECT'], broadcast: ['DIFFUSER_EN_DIRECT'], screencast: ['DIFFUSER_EN_DIRECT'],
  browser: ['NAVIGUER_SUR_LE_WEB'],
  antivirus: ['SECURISER_LA_MACHINE'], firewall: ['SECURISER_LA_MACHINE'],
  vpn: ['SECURISER_LA_MACHINE'],
  overclocking: ['SURVEILLER_LES_PERFORMANCES'], benchmark: ['SURVEILLER_LES_PERFORMANCES'],
  monitoring: ['SURVEILLER_LES_PERFORMANCES'], 'hardware-utility': ['SURVEILLER_LES_PERFORMANCES'],
  driver: ['CONFIGURER_UN_PERIPHERIQUE'], drivers: ['CONFIGURER_UN_PERIPHERIQUE'],
  uninstaller: ['INSTALLER_UN_LOGICIEL'], installer: ['INSTALLER_UN_LOGICIEL'],
  notes: ['PRENDRE_DES_NOTES'], markdown: ['ECRIRE_UN_TEXTE'],
  pdf: ['LIRE_UN_PDF'], ebook: ['LIRE_UN_LIVRE'],
  '3d': ['MODELISER_EN_3D'], cad: ['CONCEVOIR_EN_CAO'],
  photo: ['RETOUCHER_UNE_IMAGE'], image: ['RETOUCHER_UNE_IMAGE'],
  music: ['ECOUTER_DE_LA_MUSIQUE'], audio: ['ECOUTER_DE_LA_MUSIQUE'],
  video: ['REGARDER_UNE_VIDEO'], player: ['REGARDER_UNE_VIDEO'],
  email: ['GERER_SES_COURRIELS'], mail: ['GERER_SES_COURRIELS'],
  chat: ['ECHANGER_PAR_MESSAGE'], messaging: ['ECHANGER_PAR_MESSAGE'],
  game: ['JOUER'], gaming: ['JOUER'], games: ['JOUER'],
  ai: ['DIALOGUER_AVEC_UNE_IA'], llm: ['DIALOGUER_AVEC_UNE_IA'],
  // « productivity » est la categorie la plus large du Magasin : elle couvre le Bloc-
  // notes, Office, les agendas et les gestionnaires de notes. Elle ne dit rien d'une
  // fonction, et faisait passer le Bloc-notes pour un bloqueur de distractions.
  focus: ['BLOQUER_LES_DISTRACTIONS'],
}

export interface ClassementParDescription {
  activites: string[]
  justifications: string[]
}

/**
 * Classe à partir d'un texte officiel. Rend une liste vide si rien de précis ne
 * ressort — l'absence de conclusion est une réponse valable.
 */
/**
 * Un motif court doit correspondre à un MOT, pas à une suite de lettres.
 *
 * Mesuré le 2026-09-17 : le dossier « AMDInstallManager » contient « llm » — au
 * milieu de « insta·llm·anager » — et le gestionnaire d'installation d'AMD se
 * retrouvait classé « dialoguer avec une IA ».
 *
 * Les motifs d'au moins cinq lettres restent cherchés tels quels : « shell » doit
 * continuer de reconnaître « PowerShell », et « large language model » ne peut de
 * toute façon pas se cacher à l'intérieur d'un mot.
 */
function contient(texte: string, motif: string): boolean {
  if (motif.length > 4 || /\s/.test(motif)) return texte.includes(motif)
  return new RegExp(`(^|[^a-z0-9])${motif}([^a-z0-9]|$)`).test(texte)
}

export function classerParDescription(
  description: string | null | undefined,
  etiquettes: readonly string[] = [],
): ClassementParDescription {
  const texte = `${description || ''} ${etiquettes.join(' ')}`.toLowerCase()
  if (texte.trim().length < 10) return { activites: [], justifications: [] }

  const activites = new Set<string>()
  const justifications: string[] = []

  // Les etiquettes d'abord : ce sont des mots choisis par l'editeur, plus surs que
  // la prose commerciale.
  for (const e of etiquettes) {
    const cibles = ETIQUETTES[String(e).toLowerCase().trim()]
    if (!cibles) continue
    for (const a of cibles) activites.add(a)
    justifications.push(`${cibles.join(', ')} : etiquette officielle « ${e} »`)
  }

  for (const { motifs, activites: cibles } of INDICES) {
    const trouve = motifs.find((m) => contient(texte, m))
    if (!trouve) continue
    for (const a of cibles) activites.add(a)
    justifications.push(`${cibles.join(', ')} : la description officielle dit « ${trouve} »`)
  }

  for (const { activite, motifs } of EXCLUSIONS) {
    if (!activites.has(activite)) continue
    const bloquant = motifs.find((m) => contient(texte, m))
    if (bloquant) {
      activites.delete(activite)
      justifications.push(`${activite} écarté : la description dit « ${bloquant} »`)
    }
  }

  return { activites: [...activites].sort(), justifications }
}
