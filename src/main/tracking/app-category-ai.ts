import { APP_CATEGORIES, type AppCategory } from '@shared/app-categories'
import { askDeepSeekJson } from '@main/blocking/deepseek'
import log from '@main/logging/setup'

/**
 * Classement des applications par IA, en renfort du classement local.
 *
 * Le classement par mots-clés (`app-category.ts`) reconnaît ce qu'on a pensé à
 * lister. L'IA complète le reste, et rien d'autre : une catégorie, pas de
 * description. Décrire chaque application coûtait cher et prenait un temps
 * interminable pour un bénéfice nul.
 *
 * **Le résultat est constant.** Les applications sont triées avant découpe en
 * lots, et un verdict déjà en cache n'est jamais écrasé : une application
 * classée une fois garde sa place définitivement.
 *
 * Trois garde-fous, parce qu'un appel réseau par application serait intenable
 * et coûteux :
 *
 * - **Mis en cache sur disque définitivement.** Une application déjà jugée ne
 *   repart jamais, y compris quand elle n'a pas reçu de description : sinon
 *   elle serait redemandée, et refacturée, à chaque scan.
 * - **Seuil de déclenchement** côté appelant : en dessous d'une poignée
 *   d'inconnues, on n'appelle pas.
 * - **Par lots**, jamais une par une.
 *
 * Échec silencieux et sans conséquence : sans clé d'API, hors ligne ou sur
 * réponse illisible, les applications gardent leur classement local.
 */

export const AI_BATCH_SIZE = 30

export type AiVerdict = {
  category: AppCategory
}

export type AiCache = Record<string, AiVerdict>

const SYSTEM_PROMPT = [
  'Tu classes des applications Windows dans des catégories. Rien de plus.',
  `Catégories autorisées, exactement ces identifiants : ${APP_CATEGORIES.join(', ')}.`,
  'Réponds UNIQUEMENT par un objet JSON de la forme :',
  '{"resultats":[{"exe":"<nom exact reçu>","categorie":"<identifiant>"}]}',
  "Si tu ne reconnais pas une application, mets \"others\" — n'invente jamais une catégorie.",
  'Ne renvoie aucune application qui ne figure pas dans la liste reçue.',
  'Pour une même application, rends toujours exactement la même catégorie.',
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
    // Même « others » est enregistré : sans ça l'application serait redemandée
    // — et refacturée — à chaque scan.
    verdicts[exe] = { category: categorie }
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
  // Tri stable avant découpe : les mêmes applications se retrouvent dans les
  // mêmes lots d'une exécution à l'autre, donc le modèle voit le même contexte
  // et rend le même verdict. Sans ça, un ordre de scan différent suffisait à
  // faire changer un classement.
  const aJuger = resteAJuger(apps, cacheExistant).sort((a, b) =>
    a.exeName.localeCompare(b.exeName, 'en'),
  )
  if (aJuger.length === 0) return cacheExistant

  log.info(`[app-category-ai] ${aJuger.length} application(s) à classer`)
  const cache: AiCache = { ...cacheExistant }
  for (const lot of decouperEnLots(aJuger, AI_BATCH_SIZE)) {
    const verdicts = await classerUnLot(lot)
    // Un verdict déjà en cache n'est JAMAIS écrasé : une application classée
    // une fois garde sa place pour toujours. C'est ce qui rend le résultat
    // constant d'un lancement à l'autre.
    for (const [exe, verdict] of Object.entries(verdicts)) {
      if (cache[exe] === undefined) cache[exe] = verdict
    }
  }
  const nouvelles = Object.keys(cache).length - Object.keys(cacheExistant).length
  log.info(`[app-category-ai] ${nouvelles} verdict(s) obtenu(s)`)
  return cache
}
