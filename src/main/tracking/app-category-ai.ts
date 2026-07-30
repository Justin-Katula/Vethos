import { APP_CATEGORIES, type AppCategory } from '@shared/app-categories'
import { askDeepSeekJson } from '@main/blocking/deepseek'
import log from '@main/logging/setup'

/**
 * Classement des applications par IA, en renfort du classement local.
 *
 * Le classement par mots-clés (`app-category.ts`) reconnaît ce qu'on a pensé à
 * lister ; tout le reste tombe dans « Autres ». L'IA reprend uniquement ce
 * reliquat : elle sait ce qu'est « Antigravity » ou « eFootball » sans qu'on
 * ait à l'écrire.
 *
 * Trois garde-fous, parce qu'un appel réseau par application serait
 * intenable :
 *
 * - **On n'envoie que les « Autres »** — jamais les applications déjà classées.
 * - **Par lots**, pas une par une.
 * - **Mis en cache sur disque** : une application déjà jugée ne repart jamais.
 *
 * Échec silencieux et sans conséquence : sans clé d'API, hors ligne ou sur
 * réponse illisible, les applications restent simplement dans « Autres ».
 */

export const AI_BATCH_SIZE = 30

export type AiVerdict = {
  category: AppCategory
  /** Une phrase, affichable telle quelle sous le nom de l'application. */
  description: string
}

export type AiCache = Record<string, AiVerdict>

const SYSTEM_PROMPT = [
  "Tu classes des applications Windows. Pour chacune, donne sa catégorie et une description d'une phrase en français.",
  `Catégories autorisées, exactement ces identifiants : ${APP_CATEGORIES.join(', ')}.`,
  'Réponds UNIQUEMENT par un objet JSON de la forme :',
  '{"resultats":[{"exe":"<nom exact reçu>","categorie":"<identifiant>","description":"<une phrase>"}]}',
  "Si tu ne connais pas une application, mets \"others\" et décris ce que son nom suggère.",
  'Ne renvoie aucune application qui ne figure pas dans la liste reçue.',
].join(' ')

export type AppAClasser = { exeName: string; name: string; publisher?: string }

/** Découpe en lots de taille fixe. Exporté pour être testé seul. */
export function decouperEnLots<T>(items: readonly T[], taille: number): T[][] {
  if (taille <= 0) return [[...items]]
  const lots: T[][] = []
  for (let i = 0; i < items.length; i += taille) lots.push(items.slice(i, i + taille))
  return lots
}

/** Applications restant à juger : ni déjà classées localement, ni déjà en cache. */
export function resteAJuger(
  apps: readonly AppAClasser[],
  cache: AiCache,
): AppAClasser[] {
  return apps.filter((a) => cache[a.exeName.toLowerCase()] === undefined)
}

function estCategorieValide(valeur: unknown): valeur is AppCategory {
  return typeof valeur === 'string' && (APP_CATEGORIES as readonly string[]).includes(valeur)
}

/**
 * Extrait les verdicts exploitables d'une réponse brute.
 *
 * Tout ce qui est douteux est écarté plutôt que corrigé : une catégorie
 * inconnue, une application qu'on n'a pas demandée, une description vide.
 * Mieux vaut laisser une application dans « Autres » que lui coller un
 * classement inventé.
 */
export function parseAiResponse(
  brut: Record<string, unknown> | null,
  demandees: readonly string[],
): AiCache {
  if (brut === null) return {}
  const resultats = brut['resultats']
  if (!Array.isArray(resultats)) return {}

  const attendues = new Set(demandees.map((e) => e.toLowerCase()))
  const verdicts: AiCache = {}
  for (const ligne of resultats) {
    if (typeof ligne !== 'object' || ligne === null) continue
    const obj = ligne as Record<string, unknown>
    const exe = typeof obj['exe'] === 'string' ? obj['exe'].toLowerCase() : ''
    if (exe === '' || !attendues.has(exe)) continue
    const categorie = obj['categorie']
    if (!estCategorieValide(categorie)) continue
    const description = typeof obj['description'] === 'string' ? obj['description'].trim() : ''
    if (description.length === 0) continue
    verdicts[exe] = { category: categorie, description: description.slice(0, 200) }
  }
  return verdicts
}

/**
 * Juge un lot. Renvoie un cache partiel, éventuellement vide.
 * N'échoue jamais : une erreur laisse simplement le lot non classé.
 */
export async function classerUnLot(lot: readonly AppAClasser[]): Promise<AiCache> {
  if (lot.length === 0) return {}
  const liste = lot
    .map((a) => `- exe=${a.exeName} | nom=${a.name}${a.publisher ? ` | éditeur=${a.publisher}` : ''}`)
    .join('\n')
  const brut = await askDeepSeekJson({
    system: SYSTEM_PROMPT,
    user: `Classe ces ${lot.length} applications :\n${liste}`,
    // ~60 jetons par application, avec de la marge.
    maxTokens: Math.min(4000, lot.length * 80),
    timeoutMs: 30_000,
  })
  return parseAiResponse(brut, lot.map((a) => a.exeName))
}

/**
 * Classe toutes les applications non encore jugées, lot par lot, et rend le
 * cache complété. Les lots sont séquentiels : un fournisseur d'IA limite le
 * débit, et rien ici ne presse — le résultat est mis en cache pour toujours.
 */
export async function classerParIA(
  apps: readonly AppAClasser[],
  cacheExistant: AiCache,
): Promise<AiCache> {
  const aJuger = resteAJuger(apps, cacheExistant)
  if (aJuger.length === 0) return cacheExistant

  log.info(`[app-category-ai] ${aJuger.length} application(s) à classer`)
  const cache: AiCache = { ...cacheExistant }
  for (const lot of decouperEnLots(aJuger, AI_BATCH_SIZE)) {
    Object.assign(cache, await classerUnLot(lot))
  }
  const nouvelles = Object.keys(cache).length - Object.keys(cacheExistant).length
  log.info(`[app-category-ai] ${nouvelles} verdict(s) obtenu(s)`)
  return cache
}
