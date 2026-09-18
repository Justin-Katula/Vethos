import path from 'node:path'
import { APP_CATEGORIES, type AppCategory } from '@shared/app-categories'
import type {
  ClassificationSource,
  AppOverrideRecord,
} from '@shared/schemas'

export type { ClassificationSource, AppOverrideRecord }
import { buildAppRecordId, cleanNameKey } from './app-inventory'
import { askDeepSeekJson } from '@main/blocking/deepseek'
import log from '@main/logging/setup'

export const CURRENT_CLASSIFIER_VERSION = 1

export type ClassificationTriggerReason =
  | 'BLOCKING_DECISION'
  | 'USER_OPENED_APP_DETAILS'
  | 'PASSIVE_DISCOVERY'
  | 'SETTINGS_SCAN'
  | 'MANUAL_RECLASSIFICATION'

export interface AppIdentityInput {
  id?: string
  name: string
  exeName?: string
  exePath?: string
  targetPath?: string
  parsingPath?: string
  aumid?: string
  packageFamilyName?: string
  publisher?: string
}

export interface AppClassificationResult {
  appIdInterne: string
  category: AppCategory | null
  classificationState: 'RESOLVED' | 'UNRESOLVED'
  classificationSource: ClassificationSource
  classificationReasonCode: string
  classifierVersion: number
  resolvedAt: string
}

/**
 * Hiérarchie formelle d'autorité (Section 6) :
 * 1. USER_OVERRIDE
 * 2. BUILTIN_CATALOG
 * 3. EXACT_LOCAL_KNOWLEDGE
 * 4. DETERMINISTIC_METADATA_RULE
 * 5. AI_RESOLVED
 * 6. UNRESOLVED
 * 7. LEGACY_UNKNOWN
 */
export const SOURCE_AUTHORITY_RANK: Record<ClassificationSource, number> = {
  USER_OVERRIDE: 1,
  BUILTIN_CATALOG: 2,
  EXACT_LOCAL_KNOWLEDGE: 3,
  DETERMINISTIC_METADATA_RULE: 4,
  AI_RESOLVED: 5,
  UNRESOLVED: 6,
  LEGACY_UNKNOWN: 7,
}

/**
 * Détermine si une nouvelle source a l'autorité suffisante pour écraser la source existante.
 * Une source de rang inférieur ne peut JAMAIS écraser une source de rang supérieur.
 */
export function canSourceOverwrite(
  existingSource: ClassificationSource,
  newSource: ClassificationSource,
): boolean {
  const existingRank = SOURCE_AUTHORITY_RANK[existingSource] ?? 99
  const newRank = SOURCE_AUTHORITY_RANK[newSource] ?? 99
  return newRank <= existingRank
}

// ─── OVERRIDES UTILISATEUR EN MÉMOIRE / PERSISTANCE ────────────────────────

let userOverridesMap = new Map<string, AppOverrideRecord>()
let overridesPersistenceHandler: ((overrides: Record<string, AppOverrideRecord>) => Promise<void>) | null = null

export function initUserOverrides(
  initialOverrides: Record<string, AppOverrideRecord>,
  onPersist?: (overrides: Record<string, AppOverrideRecord>) => Promise<void>,
): void {
  userOverridesMap = new Map(Object.entries(initialOverrides))
  if (onPersist) {
    overridesPersistenceHandler = onPersist
  }
}

export async function setUserOverride(appId: string, category: AppCategory): Promise<void> {
  const normId = appId.toLowerCase().trim()
  userOverridesMap.set(normId, {
    category,
    overriddenAt: new Date().toISOString(),
  })
  if (overridesPersistenceHandler) {
    const serialized: Record<string, AppOverrideRecord> = {}
    for (const [k, v] of userOverridesMap.entries()) {
      serialized[k] = v
    }
    await overridesPersistenceHandler(serialized)
  }
  log.info(`[classification-resolver] USER_OVERRIDE enregistré pour ${normId} -> ${category}`)
}

export async function resetUserOverride(appId: string): Promise<void> {
  const normId = appId.toLowerCase().trim()
  userOverridesMap.delete(normId)
  if (overridesPersistenceHandler) {
    const serialized: Record<string, AppOverrideRecord> = {}
    for (const [k, v] of userOverridesMap.entries()) {
      serialized[k] = v
    }
    await overridesPersistenceHandler(serialized)
  }
  log.info(`[classification-resolver] USER_OVERRIDE réinitialisé pour ${normId}`)
}

export function getUserOverride(appId: string): AppOverrideRecord | null {
  if (!appId) return null
  const normId = appId.toLowerCase().trim()
  const direct = userOverridesMap.get(normId)
  if (direct) return direct

  // Correspondance souple pour les identifiants Steam ou variantes de protocole
  for (const [k, v] of userOverridesMap.entries()) {
    if (k === normId) return v
    const steamKeyMatch = k.match(/(?:rungameid[/\\]|steam:)(\d+)/i)
    const querySteamMatch = normId.match(/(?:rungameid[/\\]|steam:)(\d+)/i)
    if (steamKeyMatch && querySteamMatch && steamKeyMatch[1] === querySteamMatch[1]) {
      return v
    }
    if (steamKeyMatch && normId === steamKeyMatch[1]) {
      return v
    }
  }

  return null
}

export function clearUserOverrides(): void {
  userOverridesMap.clear()
}

// ─── CACHE LOCAL EXACT (EXACT_LOCAL_KNOWLEDGE) ─────────────────────────────

const localKnowledgeMap = new Map<string, AppClassificationResult>()

export function registerLocalKnowledge(result: AppClassificationResult): void {
  if (result.classificationState === 'RESOLVED' && result.category) {
    localKnowledgeMap.set(result.appIdInterne.toLowerCase().trim(), result)
  }
}

export function clearLocalKnowledge(): void {
  localKnowledgeMap.clear()
}

// ─── RÈGLES DÉTERMINISTES DE MÉTADONNÉES (DETERMINISTIC_METADATA_RULE) ──────

/**
 * Exécutables strictement dédiés à une fonction unique et sans ambiguïté.
 * Ne contient JAMAIS de lanceurs génériques (comme chrome_proxy.exe).
 */
const EXACT_EXE_RULES: Record<string, AppCategory> = {
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

  // Jeux & plateformes
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
  'robloxplayerbeta.exe': 'games',
  'heroic.exe': 'games',
  'cyberpunk2077.exe': 'games',
  'rdr2.exe': 'games',
  'acblackflag.exe': 'games',
  'forzahorizon6.exe': 'games',
  'horizonforbiddenwest.exe': 'games',
  '12minutes.exe': 'games',
  'gunsaw.exe': 'games',

  // Divertissement
  'spotify.exe': 'entertainment',
  'netflix.exe': 'entertainment',
  'vlc.exe': 'entertainment',
  'twitch.exe': 'entertainment',
  'deezer.exe': 'entertainment',

  // Création
  'blender.exe': 'creativity',
  'blender-launcher.exe': 'creativity',
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

  // Productivité
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
  'windowsterminal.exe': 'productivity',
  'wt.exe': 'productivity',
  'cursor.exe': 'productivity',
  'windsurf.exe': 'productivity',
  'zed.exe': 'productivity',
  'anythingllm.exe': 'productivity',
  'docker desktop.exe': 'productivity',
  'postman.exe': 'productivity',
  'insomnia.exe': 'productivity',
  'dbeaver.exe': 'productivity',

  // Utilitaires
  '7zfm.exe': 'utilities',
  'winrar.exe': 'utilities',
  'ccleaner.exe': 'utilities',
  'putty.exe': 'utilities',
  'filezilla.exe': 'utilities',
  'rufus.exe': 'utilities',
  'virtualbox.exe': 'utilities',
  'notepad.exe': 'utilities',
  'calc.exe': 'utilities',
  'wireshark.exe': 'utilities',
  'powertoys.exe': 'utilities',
  'sharex.exe': 'utilities',
  'chrome.exe': 'utilities',
  'firefox.exe': 'utilities',
  'msedge.exe': 'utilities',
  'brave.exe': 'utilities',
  'opera.exe': 'utilities',
  'vivaldi.exe': 'utilities',
}

/**
 * Règles exactes sur le PackageFamilyName / AUMID Windows UWP.
 */
const UWP_PACKAGE_FAMILY_RULES: Array<[string, AppCategory]> = [
  ['microsoft.windowscalculator', 'utilities'],
  ['microsoft.windowsterminal', 'productivity'],
  ['microsoft.paint', 'creativity'],
  ['microsoft.screensketch', 'utilities'],
  ['microsoft.windowsalarms', 'utilities'],
  ['microsoft.windowscamera', 'utilities'],
  ['microsoft.zunevideo', 'entertainment'],
  ['microsoft.zunemusic', 'entertainment'],
  ['microsoft.microsoftedge', 'utilities'],
]

/**
 * Évalue les règles de métadonnées déterministes.
 * Ne contient AUCUN matching par sous-chaîne vague (Section 10).
 */
export function evaluateDeterministicMetadataRules(
  identity: AppIdentityInput,
): { category: AppCategory; reasonCode: string } | null {
  const exe = (identity.exeName || (identity.exePath ? path.basename(identity.exePath) : '')).toLowerCase().trim()
  const target = (identity.targetPath || '').toLowerCase().trim()
  const parsing = (identity.parsingPath || '').toLowerCase().trim()
  const aumid = (identity.aumid || identity.parsingPath || '').toLowerCase().trim()
  const pkgFamily = (identity.packageFamilyName || '').toLowerCase().trim()
  const publisher = (identity.publisher || '').toLowerCase().trim()
  const name = identity.name.toLowerCase().trim()

  // Règle 1 : Raccourcis protocole Steam (steam://rungameid/) -> toujours des jeux
  if (target.startsWith('steam://rungameid/') || parsing.startsWith('steam://rungameid/')) {
    return { category: 'games', reasonCode: 'METADATA_STEAM_PROTOCOL' }
  }

  // Règle 2 : UWP Package Family exact
  for (const [pkgPrefix, cat] of UWP_PACKAGE_FAMILY_RULES) {
    if (pkgFamily.startsWith(pkgPrefix) || aumid.includes(pkgPrefix)) {
      return { category: cat, reasonCode: 'METADATA_UWP_PACKAGE_FAMILY' }
    }
  }

  // Règle 3 : Exécutable Win32 strict (interdiction formelle sur chrome_proxy.exe / msedge_proxy.exe)
  const isPwaProxy =
    exe === 'chrome_proxy.exe' ||
    exe === 'msedge_proxy.exe' ||
    target.endsWith('chrome_proxy.exe') ||
    target.endsWith('msedge_proxy.exe')

  if (!isPwaProxy && exe && EXACT_EXE_RULES[exe]) {
    return { category: EXACT_EXE_RULES[exe], reasonCode: 'METADATA_EXACT_EXE' }
  }

  // Règle 4 : Combinaison exacte Publisher + ProductName
  if (publisher === 'valve corp.' && (name === 'steam' || exe === 'steam.exe')) {
    return { category: 'games', reasonCode: 'METADATA_EXACT_PUBLISHER_PRODUCT' }
  }
  if (publisher === 'discord inc.' && (name === 'discord' || exe === 'discord.exe')) {
    return { category: 'social', reasonCode: 'METADATA_EXACT_PUBLISHER_PRODUCT' }
  }
  if (publisher === 'spotify ab' && (name === 'spotify' || exe === 'spotify.exe')) {
    return { category: 'entertainment', reasonCode: 'METADATA_EXACT_PUBLISHER_PRODUCT' }
  }

  return null
}

// ─── CLASSIFICATION IA CANONIQUE (Section 14) ──────────────────────────────

/**
 * Demande à DeepSeek de classifier une application uniquement avec les catégories canoniques.
 * Sortie obligatoire : JSON { "category": "<AppCategory>" }.
 * Aucune autre catégorie n'est tolérée.
 */
export async function askAiForAppCategory(
  identity: AppIdentityInput,
): Promise<AppCategory | null> {
  const allowedCategoriesStr = APP_CATEGORIES.join(', ')

  const systemPrompt = [
    'Tu es le classifieur officiel d’applications de Vethos.',
    'Ta seule tâche est d’attribuer UNE catégorie canonique à l’application reçue.',
    `Catégories strictement autorisées (aucune autre) : ${allowedCategoriesStr}.`,
    'Réponds STRICTEMENT par un objet JSON au format suivant, sans explication :',
    '{"category": "<identifiant_exact_de_la_catégorie>"}',
  ].join(' ')

  const userPrompt = [
    `Application à classifier :`,
    `- Nom affiché : ${identity.name}`,
    identity.exeName ? `- Exécutable : ${identity.exeName}` : '',
    identity.publisher ? `- Éditeur : ${identity.publisher}` : '',
    identity.aumid ? `- AUMID : ${identity.aumid}` : '',
    `Quelle est sa catégorie canonique parmi : ${allowedCategoriesStr} ?`,
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const raw = await askDeepSeekJson({
      system: systemPrompt,
      user: userPrompt,
      maxTokens: 100,
      timeoutMs: 15_000,
      operationType: 'APP_KNOWLEDGE',
      triggerReason: 'APP_PROFILE_UNRESOLVED_REQUIRED_NOW',
    })

    if (!raw || typeof raw !== 'object') {
      return null
    }

    const rawCategory = typeof raw['category'] === 'string' ? raw['category'].trim().toLowerCase() : ''

    // Validation stricte contre l'enum canonique (Section 14)
    if ((APP_CATEGORIES as readonly string[]).includes(rawCategory)) {
      return rawCategory as AppCategory
    }

    log.warn(
      `[classification-resolver] Rejet de la réponse DeepSeek : "${rawCategory}" n'est pas une catégorie canonique.`,
    )
    return null
  } catch (err) {
    log.warn(`[classification-resolver] Échec appel IA pour ${identity.name} :`, err)
    return null
  }
}

/**
 * Résolution déterministe synchrone (Étapes 1 à 5).
 * Ne fait JAMAIS d'appel réseau. Idéal pour les scans rapides et la découverte passive.
 */
export function resolveAppClassificationSync(
  identity: AppIdentityInput,
  _triggerReason: ClassificationTriggerReason = 'PASSIVE_DISCOVERY',
  options: { nowIso?: string } = {},
): AppClassificationResult {
  const nowIso = options.nowIso || new Date().toISOString()

  // Étape 1 : Établir l'identité interne stable (IdentityResolver)
  const appIdInterne =
    identity.id ||
    buildAppRecordId(identity.targetPath || identity.exePath, identity.parsingPath || identity.aumid, identity.name)

  // Étape 2 : Vérifier USER_OVERRIDE (autorité maximale)
  const cleanName = identity.name ? cleanNameKey(identity.name) : ''
  const override =
    getUserOverride(appIdInterne) ||
    (identity.id ? getUserOverride(identity.id) : null) ||
    (identity.exeName ? getUserOverride(identity.exeName) : null) ||
    getUserOverride(identity.name) ||
    (cleanName ? getUserOverride(cleanName) : null)
  if (override && (APP_CATEGORIES as readonly string[]).includes(override.category)) {
    return {
      appIdInterne,
      category: override.category,
      classificationState: 'RESOLVED',
      classificationSource: 'USER_OVERRIDE',
      classificationReasonCode: 'USER_MANUAL_OVERRIDE',
      classifierVersion: CURRENT_CLASSIFIER_VERSION,
      resolvedAt: override.overriddenAt || nowIso,
    }
  }

  // Etape 3 supprimee : le catalogue integre n'existe plus.

  // Étape 4 : Vérifier EXACT_LOCAL_KNOWLEDGE
  const local = localKnowledgeMap.get(appIdInterne.toLowerCase().trim())
  if (local && local.classificationState === 'RESOLVED' && local.category) {
    return local
  }

  // Étape 5 : Appliquer DETERMINISTIC_METADATA_RULES
  const metaRule = evaluateDeterministicMetadataRules(identity)
  if (metaRule && (APP_CATEGORIES as readonly string[]).includes(metaRule.category)) {
    const res: AppClassificationResult = {
      appIdInterne,
      category: metaRule.category,
      classificationState: 'RESOLVED',
      classificationSource: 'DETERMINISTIC_METADATA_RULE',
      classificationReasonCode: metaRule.reasonCode,
      classifierVersion: CURRENT_CLASSIFIER_VERSION,
      resolvedAt: nowIso,
    }
    registerLocalKnowledge(res)
    return res
  }

  // Fallback synchrone : état UNRESOLVED propre (Section 2)
  return {
    appIdInterne,
    category: null,
    classificationState: 'UNRESOLVED',
    classificationSource: 'UNRESOLVED',
    classificationReasonCode: 'UNRESOLVED_NO_DETERMINISTIC_MATCH',
    classifierVersion: CURRENT_CLASSIFIER_VERSION,
    resolvedAt: nowIso,
  }
}

/**
 * Porte d'entrée unique de classification d'application dans Vethos.
 *
 * Ordre de résolution canonique :
 * 1. Exécuter la chaîne locale déterministe (resolveAppClassificationSync).
 * 2. Si résolue -> RETOURNE immédiatement.
 * 3. Si non résolue et CLASSIFICATION_REQUIRED_NOW == false -> RETOURNE UNRESOLVED (0 appel IA).
 * 4. Si CLASSIFICATION_REQUIRED_NOW == true -> résout via DeepSeek avec validation stricte.
 * 5. Si réponse IA valide -> RETOURNE AI_RESOLVED.
 * 6. Si erreur/timeout/rejet IA -> RETOURNE UNRESOLVED (category: null, JAMAIS 'others' !).
 */
export async function resolveAppClassification(
  identity: AppIdentityInput,
  triggerReasonOrOptions:
    | ClassificationTriggerReason
    | { requiredNow?: boolean; nowIso?: string } = 'PASSIVE_DISCOVERY',
  options: { requiredNow?: boolean; nowIso?: string } = {},
): Promise<AppClassificationResult> {
  const triggerReason: ClassificationTriggerReason =
    typeof triggerReasonOrOptions === 'string' ? triggerReasonOrOptions : 'PASSIVE_DISCOVERY'
  const resolvedOptions =
    typeof triggerReasonOrOptions === 'object' ? triggerReasonOrOptions : options

  // Exécution de la chaîne locale déterministe (Étapes 1 à 5)
  const localResult = resolveAppClassificationSync(identity, triggerReason, resolvedOptions)
  if (localResult.classificationState === 'RESOLVED') {
    return localResult
  }

  // Étape 6 : Vérifier si la classification est requise immédiatement
  const classificationRequiredNow =
    resolvedOptions.requiredNow === true ||
    triggerReason === 'BLOCKING_DECISION' ||
    triggerReason === 'MANUAL_RECLASSIFICATION'

  if (!classificationRequiredNow) {
    return localResult // UNRESOLVED
  }

  // Étape 7 : Résoudre via DeepSeek
  const nowIso = resolvedOptions.nowIso || new Date().toISOString()
  const appIdInterne = localResult.appIdInterne
  log.info(`[classification-resolver] IA requise (${triggerReason}) pour : ${identity.name} (${appIdInterne})`)
  const aiCategory = await askAiForAppCategory(identity)

  // Étape 8 : Si valide -> AI_RESOLVED
  if (aiCategory && (APP_CATEGORIES as readonly string[]).includes(aiCategory)) {
    const res: AppClassificationResult = {
      appIdInterne,
      category: aiCategory,
      classificationState: 'RESOLVED',
      classificationSource: 'AI_RESOLVED',
      classificationReasonCode: 'AI_CATEGORY_RESPONSE',
      classifierVersion: CURRENT_CLASSIFIER_VERSION,
      resolvedAt: nowIso,
    }
    registerLocalKnowledge(res)
    return res
  }

  // Étape 9 : Échec, timeout ou catégorie invalide -> UNRESOLVED (jamais 'others' !)
  return {
    appIdInterne,
    category: null,
    classificationState: 'UNRESOLVED',
    classificationSource: 'UNRESOLVED',
    classificationReasonCode: 'UNRESOLVED_AI_ERROR',
    classifierVersion: CURRENT_CLASSIFIER_VERSION,
    resolvedAt: nowIso,
  }
}
