/**
 * Classement des applications installées en catégories affichables.
 *
 * Honnêteté sur la méthode : il n'existe aucune source d'autorité sur la
 * catégorie d'un programme Windows. Le Microsoft Store en déclare une pour
 * ses paquets, mais la majorité des applications de bureau n'en ont aucune.
 * On classe donc par reconnaissance de nom, puis par mots-clés, puis par
 * éditeur. C'est faillible par construction — d'où la catégorie « Autres »,
 * qui est un aveu assumé plutôt qu'un fourre-tout honteux.
 *
 * Toute la logique est pure : elle prend un nom, un exécutable et un éditeur,
 * elle rend une catégorie. Elle se teste sans toucher au système.
 */

import { APP_CATEGORIES, type AppCategory } from '@shared/app-categories'

// Le vocabulaire des catégories vit dans `shared` : main, preload et renderer
// en ont tous besoin. Seule la logique de classement reste ici.
export { APP_CATEGORIES, CATEGORY_LABELS, type AppCategory } from '@shared/app-categories'

/**
 * Applications reconnues par leur exécutable. Le plus fiable des trois
 * signaux : un nom d'exécutable ne dépend ni de la langue d'installation ni
 * de la façon dont l'éditeur a rédigé son libellé.
 */
const PAR_EXECUTABLE: Record<string, AppCategory> = {
  // Social
  'discord.exe': 'social',
  'slack.exe': 'social',
  'teams.exe': 'social',
  'ms-teams.exe': 'social',
  'whatsapp.exe': 'social',
  'telegram.exe': 'social',
  'signal.exe': 'social',
  'skype.exe': 'social',
  'zoom.exe': 'social',
  'messenger.exe': 'social',
  'instagram.exe': 'social',
  'tiktok.exe': 'social',
  'snapchat.exe': 'social',
  'x.exe': 'social',
  'mastodon.exe': 'social',

  // Jeux et plateformes de jeu
  'steam.exe': 'games',
  'epicgameslauncher.exe': 'games',
  'battle.net.exe': 'games',
  'riotclientservices.exe': 'games',
  'leagueoflegends.exe': 'games',
  'valorant.exe': 'games',
  'origin.exe': 'games',
  'eadesktop.exe': 'games',
  'galaxyclient.exe': 'games',
  'ubisoftconnect.exe': 'games',
  'upc.exe': 'games',
  'minecraft.exe': 'games',
  'minecraftlauncher.exe': 'games',
  'roblox.exe': 'games',
  'robloxplayerbeta.exe': 'games',
  'itch.exe': 'games',
  'launcher.exe': 'games',
  'launcherpatcher.exe': 'games',
  'playnite.desktopapp.exe': 'games',
  'heroic.exe': 'games',

  // Divertissement
  'spotify.exe': 'entertainment',
  'netflix.exe': 'entertainment',
  'vlc.exe': 'entertainment',
  'youtube.exe': 'entertainment',
  'twitch.exe': 'entertainment',
  'primevideo.exe': 'entertainment',
  'disneyplus.exe': 'entertainment',
  'plex.exe': 'entertainment',
  'itunes.exe': 'entertainment',
  'deezer.exe': 'entertainment',

  // Création
  'blender.exe': 'creativity',
  'photoshop.exe': 'creativity',
  'illustrator.exe': 'creativity',
  'premiere.exe': 'creativity',
  'afterfx.exe': 'creativity',
  'indesign.exe': 'creativity',
  'lightroom.exe': 'creativity',
  'figma.exe': 'creativity',
  'krita.exe': 'creativity',
  'gimp.exe': 'creativity',
  'gimp-2.10.exe': 'creativity',
  'inkscape.exe': 'creativity',
  'audacity.exe': 'creativity',
  'obs64.exe': 'creativity',
  'obs32.exe': 'creativity',
  'davinciresolve.exe': 'creativity',
  'unity.exe': 'creativity',
  'unrealeditor.exe': 'creativity',
  'ableton live.exe': 'creativity',
  'flstudio.exe': 'creativity',
  'reaper.exe': 'creativity',
  'canva.exe': 'creativity',

  // Éducation
  'anki.exe': 'education',
  'duolingo.exe': 'education',
  'scratch.exe': 'education',
  'geogebra.exe': 'education',

  // Santé et sport
  'strava.exe': 'health',
  'garminexpress.exe': 'health',
  'fitbit.exe': 'health',

  // Information et lecture
  'calibre.exe': 'reading',
  'kindle.exe': 'reading',
  'sumatrapdf.exe': 'reading',
  'acrord32.exe': 'reading',
  'acrobat.exe': 'reading',
  'feedly.exe': 'reading',
  'pocket.exe': 'reading',

  // Productivité et finance
  'code.exe': 'productivity',
  'devenv.exe': 'productivity',
  'idea64.exe': 'productivity',
  'pycharm64.exe': 'productivity',
  'webstorm64.exe': 'productivity',
  'clion64.exe': 'productivity',
  'rider64.exe': 'productivity',
  'sublime_text.exe': 'productivity',
  'notepad++.exe': 'productivity',
  'winword.exe': 'productivity',
  'excel.exe': 'productivity',
  'powerpnt.exe': 'productivity',
  'outlook.exe': 'productivity',
  'onenote.exe': 'productivity',
  'notion.exe': 'productivity',
  'obsidian.exe': 'productivity',
  'todoist.exe': 'productivity',
  'trello.exe': 'productivity',
  'thunderbird.exe': 'productivity',
  'git-bash.exe': 'productivity',
  'git-cmd.exe': 'productivity',
  'git-gui.exe': 'productivity',
  'gitk.exe': 'productivity',
  'githubdesktop.exe': 'productivity',
  'gitkraken.exe': 'productivity',
  'sourcetree.exe': 'productivity',
  'windowsterminal.exe': 'productivity',
  'wt.exe': 'productivity',
  // Éditeurs et assistants de code récents — sans eux, tout un poste de
  // développeur atterrissait dans « Autres ».
  'antigravity.exe': 'productivity',
  'cursor.exe': 'productivity',
  'windsurf.exe': 'productivity',
  'zed.exe': 'productivity',
  'anythingllm.exe': 'productivity',
  'lmstudio.exe': 'productivity',
  'ollama.exe': 'productivity',
  'docker desktop.exe': 'productivity',
  'postman.exe': 'productivity',
  'insomnia.exe': 'productivity',
  'dbeaver.exe': 'productivity',
  'ssms.exe': 'productivity',
  'bun.exe': 'productivity',
  'node.exe': 'productivity',
  'python.exe': 'productivity',
  'pythonw.exe': 'productivity',
  'idle.exe': 'productivity',
  'rstudio.exe': 'productivity',
  'matlab.exe': 'productivity',
  'godot.exe': 'productivity',
  'cocosdashboard.exe': 'productivity',
  'incredibuild.exe': 'productivity',
  'jupyter-lab.exe': 'productivity',

  // Achats et cuisine
  'amazon.exe': 'shopping',
  'ebay.exe': 'shopping',
  'ubereats.exe': 'shopping',

  // Voyage
  'booking.exe': 'travel',
  'airbnb.exe': 'travel',
  'maps.exe': 'travel',

  // Utilitaires
  '7zfm.exe': 'utilities',
  'winrar.exe': 'utilities',
  'ccleaner.exe': 'utilities',
  'putty.exe': 'utilities',
  'filezilla.exe': 'utilities',
  'teamviewer.exe': 'utilities',
  'anydesk.exe': 'utilities',
  'rufus.exe': 'utilities',
  'virtualbox.exe': 'utilities',
  'vmware.exe': 'utilities',
  'msiafterburner.exe': 'utilities',
  'hwinfo64.exe': 'utilities',
  'cpu-z.exe': 'utilities',
  'gpu-z.exe': 'utilities',
  'crystaldiskinfo.exe': 'utilities',
  'everything.exe': 'utilities',
  'powertoys.exe': 'utilities',
  'sharex.exe': 'utilities',
  'notepad.exe': 'utilities',
  'calc.exe': 'utilities',
  'wireshark.exe': 'utilities',
  'cold turkey blocker.exe': 'utilities',
  'nvidia app.exe': 'utilities',
  'geforce experience.exe': 'utilities',
  'armourycrate.exe': 'utilities',
  'explorer.exe': 'utilities',
  'chrome.exe': 'utilities',
  'firefox.exe': 'utilities',
  'msedge.exe': 'utilities',
  'brave.exe': 'utilities',
  'opera.exe': 'utilities',
  'vivaldi.exe': 'utilities',
}

/** Mots-clés cherchés dans le nom affiché, puis dans le nom de l'exécutable. */
const PAR_MOT_CLE: Array<[AppCategory, readonly string[]]> = [
  ['social', ['chat', 'messeng', 'social', 'discord', 'whatsapp', 'telegram', 'meet', 'confer']],
  // Pas de « play » seul : il attrape « Player », « Playback », « Playlist »
  // et volerait toutes les applications multimédia aux catégories voisines.
  ['games', ['game', 'jeu', 'gaming', 'launcher']],
  // Pas de « lecteur » : en français le mot désigne aussi bien un lecteur
  // vidéo qu'un lecteur PDF. On s'appuie sur le nom du média lui-même.
  ['entertainment', ['music', 'musique', 'video', 'vidéo', 'stream', 'tv', 'film', 'movie', 'radio', 'podcast']],
  ['creativity', ['photo', 'image', 'draw', 'dessin', 'paint', 'edit', 'design', 'render', '3d', 'audio', 'studio', 'creative', 'anim']],
  ['education', ['learn', 'appren', 'course', 'cours', 'school', 'école', 'ecole', 'study', 'étude', 'etude', 'dictionar', 'lang']],
  ['health', ['health', 'santé', 'sante', 'fitness', 'workout', 'sport', 'sleep', 'sommeil', 'medit']],
  ['reading', ['read', 'lect', 'book', 'livre', 'ebook', 'pdf', 'news', 'presse', 'journal', 'magazine', 'wiki']],
  ['productivity', ['office', 'bureau', 'note', 'task', 'tâche', 'tache', 'todo', 'calendar', 'agenda', 'mail', 'code', 'develop', 'ide ', 'terminal', 'sql', 'database', 'bank', 'banque', 'finance', 'compta', 'invoice', 'facture', 'git', 'python', 'docker', 'llm', 'copilot', 'jupyter', 'console', 'shell', 'prompt', 'debug', 'profiler', 'compiler', '编']],
  ['shopping', ['shop', 'achat', 'store', 'boutique', 'food', 'cuisine', 'recipe', 'recette', 'delivery', 'livraison']],
  ['travel', ['travel', 'voyage', 'flight', 'vol', 'hotel', 'map', 'carte', 'gps', 'navigation', 'transit']],
  ['utilities', ['tool', 'outil', 'util', 'clean', 'backup', 'sauvegarde', 'compress', 'archive', 'zip', 'ftp', 'ssh', 'remote', 'vpn', 'antivirus', 'monitor', 'browser', 'navigateur', 'blocker', 'bloqueur', 'screenshot', 'capture', 'benchmark', 'overclock', 'afterburner', 'settings', 'paramètre', 'parametre', 'control', 'contrôle', 'controle']],
]

function normaliser(valeur: string): string {
  return valeur
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

export type CategorisableApp = {
  name: string
  exeName: string
  publisher?: string
}

/**
 * Classe une application. L'ordre des signaux va du plus fiable au plus
 * approximatif : exécutable connu, puis mots-clés du nom, puis mots-clés de
 * l'exécutable. Sans correspondance : « Autres ».
 */
export function categorizeApp(app: CategorisableApp): AppCategory {
  const exe = app.exeName.toLowerCase()
  const connu = PAR_EXECUTABLE[exe]
  if (connu !== undefined) return connu

  const nom = normaliser(app.name)
  for (const [categorie, motsCles] of PAR_MOT_CLE) {
    if (motsCles.some((mot) => nom.includes(normaliser(mot)))) return categorie
  }

  const exeNormalise = normaliser(exe.replace(/\.exe$/, ''))
  for (const [categorie, motsCles] of PAR_MOT_CLE) {
    if (motsCles.some((mot) => exeNormalise.includes(normaliser(mot)))) return categorie
  }

  return 'others'
}

/** Catégories réellement présentes, dans l'ordre d'affichage, « Autres » en dernier. */
export function categoriesPresentes(apps: readonly CategorisableApp[]): AppCategory[] {
  const presentes = new Set(apps.map(categorizeApp))
  return APP_CATEGORIES.filter((c) => presentes.has(c))
}
