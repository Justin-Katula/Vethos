/**
 * Ce qu'une application SAIT OUVRIR révèle ce qu'on FAIT avec elle.
 *
 * Windows enregistre, pour chaque type de fichier, l'application qui l'ouvre. Cette
 * déclaration est posée par l'installateur — elle ne vient d'aucune recherche et ne
 * peut pas être hallucinée. Elle suffit à classer une application sans rien savoir
 * de son nom ni de son éditeur.
 *
 * Mesuré sur une machine réelle le 2026-09-17 :
 *   excel.exe        → .xlsx .csv .ods        = travailler sur un tableur
 *   py.exe           → .py .pyc               = écrire du code
 *   jdownloader2.exe → .nzb .dlc .metalink    = télécharger
 *   outlook.exe      → .msg .pst .ics         = courriels et agenda
 *
 * Les identifiants employés proviennent tous de `src/shared/activites.json`.
 */

/** Une extension peut impliquer plusieurs activités : un lecteur vidéo lit aussi l'audio. */
export const EXTENSION_VERS_ACTIVITES: Readonly<Record<string, readonly string[]>> = {
  // --- Programmation ---
  ...fromList(
    ['.py', '.pyc', '.pyo', '.pyz', '.ipynb', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx',
     '.c', '.h', '.cpp', '.hpp', '.cc', '.cs', '.java', '.kt', '.go', '.rs', '.rb', '.php',
     '.swift', '.lua', '.pl', '.scala', '.clj', '.ex', '.exs', '.dart', '.vb', '.asm',
     '.sln', '.slnx', '.slnf', '.csproj', '.vbproj', '.vcxproj', '.shproj', '.gradle',
     '.cmake', '.makefile', '.gemspec', '.cabal'],
    ['ECRIRE_DU_CODE'],
  ),
  ...fromList(['.sh', '.bash', '.ps1', '.psm1', '.psd1', '.bat', '.cmd', '.vbs', '.wsf'], ['ADMINISTRER_SYSTEME']),
  ...fromList(['.sql', '.db', '.sqlite', '.sqlite3', '.mdb', '.accdb', '.accde', '.bak'], ['ADMINISTRER_BASE_DONNEES']),
  ...fromList(['.vmdk', '.vdi', '.ova', '.ovf', '.vbox', '.vhd', '.vhdx'], ['VIRTUALISER']),
  ...fromList(['.http', '.rest', '.postman_collection'], ['TESTER_UNE_API']),

  // --- Web ---
  ...fromList(['.html', '.htm', '.xhtml', '.mht', '.mhtml', '.url', '.website'], ['NAVIGUER_SUR_LE_WEB']),
  ...fromList(['.css', '.scss', '.sass', '.less', '.vue', '.svelte', '.astro'], ['ECRIRE_DU_CODE']),

  // --- Bureautique ---
  ...fromList(['.doc', '.docx', '.docm', '.dot', '.dotx', '.odt', '.rtf', '.wpd', '.pages', '.wbk'], ['REDIGER_UN_DOCUMENT']),
  ...fromList(['.xls', '.xlsx', '.xlsm', '.xlsb', '.xlt', '.xltx', '.ods', '.csv', '.tsv', '.numbers', '.xla', '.xlam'], ['TRAVAILLER_SUR_TABLEUR']),
  ...fromList(['.ppt', '.pptx', '.pptm', '.pot', '.potx', '.pps', '.ppsx', '.odp', '.key'], ['PREPARER_UNE_PRESENTATION']),
  ...fromList(['.pdf', '.xps', '.oxps', '.djvu'], ['LIRE_UN_PDF']),
  ...fromList(['.vsd', '.vsdx', '.vss', '.vst', '.vdx'], ['CREER_UN_DIAGRAMME']),

  // --- Écriture et notes ---
  ...fromList(['.md', '.markdown', '.mdx', '.adoc', '.rst', '.org'], ['ECRIRE_UN_TEXTE']),
  ...fromList(['.one', '.onepkg', '.onetoc', '.onetoc2', '.onex', '.enex'], ['PRENDRE_DES_NOTES']),

  // --- Images ---
  ...fromList(['.psd', '.psb', '.xcf', '.kra', '.clip', '.sai', '.afphoto', '.pdn', '.ora'], ['RETOUCHER_UNE_IMAGE']),
  ...fromList(['.ai', '.cdr', '.afdesign', '.eps', '.svg', '.svgz'], ['DESSINER']),
  ...fromList(['.cr2', '.cr3', '.nef', '.arw', '.dng', '.raf', '.orf', '.rw2', '.pef'], ['RETOUCHER_UNE_IMAGE']),
  ...fromList(['.indd', '.idml', '.afpub', '.pub'], ['METTRE_EN_PAGE']),

  // --- 3D et CAO ---
  ...fromList(['.blend', '.fbx', '.obj', '.stl', '.3ds', '.max', '.ma', '.mb', '.c4d', '.dae',
               '.glb', '.gltf', '.ztl', '.skp', '.ply', '.usd', '.usdz'], ['MODELISER_EN_3D']),
  ...fromList(['.dwg', '.dxf', '.step', '.stp', '.iges', '.igs', '.sldprt', '.sldasm', '.slddrw',
               '.ipt', '.iam', '.catpart', '.catproduct', '.rvt', '.rfa', '.f3d', '.scdoc'], ['CONCEVOIR_EN_CAO']),

  // --- Vidéo ---
  ...fromList(['.prproj', '.aep', '.veg', '.fcpxml', '.kdenlive', '.drp', '.mlt', '.wlmp', '.camproj'], ['MONTER_UNE_VIDEO']),
  ...fromList(['.srt', '.ass', '.ssa', '.vtt', '.sub', '.idx'], ['MONTER_UNE_VIDEO']),
  ...fromList(['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.mpeg', '.mpg',
               '.3gp', '.3g2', '.ts', '.m2ts', '.vob', '.asf', '.rmvb', '.divx'], ['REGARDER_UNE_VIDEO']),

  // --- Audio ---
  ...fromList(['.flp', '.als', '.alp', '.ptx', '.cpr', '.rpp', '.aup', '.aup3', '.sesx', '.npr',
               '.band', '.logic', '.reason', '.song'], ['PRODUIRE_DE_LA_MUSIQUE']),
  ...fromList(['.mp3', '.flac', '.aac', '.ogg', '.oga', '.wav', '.m4a', '.wma', '.opus', '.aiff',
               '.aif', '.aifc', '.adt', '.adts', '.ape', '.alac'], ['ECOUTER_DE_LA_MUSIQUE']),
  ...fromList(['.mid', '.midi', '.musicxml', '.mscz', '.sib', '.gp', '.gp5', '.gpx'], ['PRODUIRE_DE_LA_MUSIQUE']),

  // --- Fichiers et transferts ---
  ...fromList(['.zip', '.rar', '.7z', '.tar', '.gz', '.tgz', '.bz2', '.tbz2', '.xz', '.txz',
               '.cab', '.arj', '.lzh', '.zst', '.cpio', '.nupkg'], ['ARCHIVER']),
  ...fromList(['.torrent', '.nzb', '.dlc', '.ccf', '.rsdf', '.metalink', '.meta4', '.sfdl', '.crdownload'], ['TELECHARGER']),
  ...fromList(['.iso', '.img', '.bin', '.cue', '.mds', '.mdf', '.nrg', '.isz', '.ui'], ['SAUVEGARDER']),

  // --- Communication ---
  ...fromList(['.msg', '.eml', '.emlx', '.pst', '.ost', '.mbox', '.oft'], ['GERER_SES_COURRIELS']),
  ...fromList(['.ics', '.vcs', '.hol', '.ical'], ['GERER_SON_AGENDA']),

  // --- Lecture ---
  ...fromList(['.epub', '.mobi', '.azw', '.azw3', '.fb2', '.lit', '.pdb', '.cbz', '.cbr', '.cb7'], ['LIRE_UN_LIVRE']),
  ...fromList(['.opml'], ['LIRE_LES_ACTUALITES']),

  // --- Données ---
  ...fromList(['.rdata', '.rds', '.sav', '.dta', '.mat', '.parquet', '.feather', '.hdf5', '.h5'], ['ANALYSER_DES_DONNEES']),
  ...fromList(['.pbix', '.twb', '.twbx', '.qvf'], ['CONSTRUIRE_UN_TABLEAU_DE_BORD']),
}

/** Un protocole d'URL déclare une capacité de lancement ou d'ouverture. */
export const PROTOCOLE_VERS_ACTIVITES: Readonly<Record<string, readonly string[]>> = {
  http: ['NAVIGUER_SUR_LE_WEB'],
  https: ['NAVIGUER_SUR_LE_WEB'],
  // Chaque navigateur enregistre AUSSI son protocole propre, qui sert a le rappeler
  // depuis une page. Sans ces entrees, Chrome et Brave restaient sans preuve alors
  // qu'ils declaraient bien quelque chose.
  'google-chrome': ['NAVIGUER_SUR_LE_WEB'],
  'brave-browser': ['NAVIGUER_SUR_LE_WEB'],
  'microsoft-edge': ['NAVIGUER_SUR_LE_WEB'],
  firefox: ['NAVIGUER_SUR_LE_WEB'],
  'ie.http': ['NAVIGUER_SUR_LE_WEB'],
  opera: ['NAVIGUER_SUR_LE_WEB'],
  vivaldi: ['NAVIGUER_SUR_LE_WEB'],
  tor: ['NAVIGUER_SUR_LE_WEB'],
  mailto: ['GERER_SES_COURRIELS'],
  feed: ['LIRE_LES_ACTUALITES'],
  feeds: ['LIRE_LES_ACTUALITES'],
  webcal: ['GERER_SON_AGENDA'],
  ldap: ['ADMINISTRER_SYSTEME'],
  magnet: ['TELECHARGER'],
  ed2k: ['TELECHARGER'],
  steam: ['JOUER', 'GERER_SA_LUDOTHEQUE'],
  steamlink: ['JOUER'],
  itch: ['JOUER', 'GERER_SA_LUDOTHEQUE'],
  itchio: ['JOUER', 'GERER_SA_LUDOTHEQUE'],
  uplay: ['JOUER', 'GERER_SA_LUDOTHEQUE'],
  'com.epicgames.launcher': ['JOUER', 'GERER_SA_LUDOTHEQUE'],
  rockstar: ['JOUER', 'GERER_SA_LUDOTHEQUE'],
  'battlenet': ['JOUER', 'GERER_SA_LUDOTHEQUE'],
  goggalaxy: ['JOUER', 'GERER_SA_LUDOTHEQUE'],
  origin: ['JOUER', 'GERER_SA_LUDOTHEQUE'],
  ealink: ['JOUER', 'GERER_SA_LUDOTHEQUE'],
  csgo: ['JOUER'],
  nxm: ['GERER_SA_LUDOTHEQUE'],
  discord: ['ECHANGER_PAR_MESSAGE'],
  slack: ['ECHANGER_PAR_MESSAGE'],
  tg: ['ECHANGER_PAR_MESSAGE'],
  whatsapp: ['ECHANGER_PAR_MESSAGE'],
  zoommtg: ['PARTICIPER_A_UNE_REUNION'],
  msteams: ['PARTICIPER_A_UNE_REUNION'],
  vscode: ['ECRIRE_DU_CODE'],
  'vscode-insiders': ['ECRIRE_DU_CODE'],
  cursor: ['ECRIRE_DU_CODE'],
  windsurf: ['ECRIRE_DU_CODE'],
  devin: ['ECRIRE_DU_CODE'],
  antigravity: ['ECRIRE_DU_CODE'],
  jetbrains: ['ECRIRE_DU_CODE'],
  'github-windows': ['GERER_VERSIONS'],
  'x-github-client': ['GERER_VERSIONS'],
  'docker-desktop': ['VIRTUALISER'],
  claude: ['DIALOGUER_AVEC_UNE_IA'],
  'claude-cli': ['DIALOGUER_AVEC_UNE_IA'],
  kimi: ['DIALOGUER_AVEC_UNE_IA'],
  'kimi-work': ['DIALOGUER_AVEC_UNE_IA'],
  anythingllm: ['DIALOGUER_AVEC_UNE_IA'],
  lmstudio: ['DIALOGUER_AVEC_UNE_IA'],
  ollama: ['DIALOGUER_AVEC_UNE_IA'],
  chatgpt: ['DIALOGUER_AVEC_UNE_IA'],
  perplexity: ['DIALOGUER_AVEC_UNE_IA'],
  canva: ['DESSINER', 'METTRE_EN_PAGE'],
  figma: ['MAQUETTER_UNE_INTERFACE'],
  obsidian: ['PRENDRE_DES_NOTES', 'ORGANISER_DES_CONNAISSANCES'],
  notion: ['PRENDRE_DES_NOTES', 'ORGANISER_DES_CONNAISSANCES'],
  onenote: ['PRENDRE_DES_NOTES'],
  'onenote-cmd': ['PRENDRE_DES_NOTES'],
  spotify: ['ECOUTER_DE_LA_MUSIQUE'],
  mms: ['REGARDER_UNE_VIDEO'],
  'dlna-playsingle': ['REGARDER_UNE_VIDEO'],
  'cocos-dashboard': ['CREER_UN_JEU'],
  drivereasy: ['CONFIGURER_UN_PERIPHERIQUE'],
  pcassist: ['CONFIGURER_LE_SYSTEME'],
  grvopen: ['SAUVEGARDER'],
  odopen: ['SAUVEGARDER'],
}

/** Construit un enregistrement en associant la même liste à plusieurs extensions. */
function fromList(extensions: readonly string[], activites: readonly string[]): Record<string, readonly string[]> {
  const o: Record<string, readonly string[]> = {}
  for (const e of extensions) o[e.toLowerCase()] = activites
  return o
}
