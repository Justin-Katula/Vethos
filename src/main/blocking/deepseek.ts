import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import log from '@main/logging/setup'
import {
  deepSeekMetrics,
  type DeepSeekOperationType,
  type DeepSeekTriggerReason,
} from './deepseek-metrics'

/**
 * Gateway DeepSeek pour les opérations IA de Vethos.
 * Centralise l'accès HTTP, le modèle, la gestion des timeouts et les métriques.
 */

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions'
const DEFAULT_DEEPSEEK_MODEL = 'deepseek-v4-flash'
const REQUEST_TIMEOUT_MS = 15_000

function getModelName(): string {
  return readEnvValue('DEEPSEEK_MODEL') ?? DEFAULT_DEEPSEEK_MODEL
}

export type DeepSeekApiErrorType =
  | 'NO_API_KEY'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'HTTP_ERROR'
  | 'UNREADABLE_JSON'

export type DeepSeekDetailedResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: DeepSeekApiErrorType; status?: number; message: string }

/**
 * Appel générique détaillé avec rapport précis sur la cause d'échec
 * (timeout, réseau, HTTP non-2xx, parse JSON).
 */
export async function askDeepSeekJsonDetailed(args: {
  system: string
  user: string
  maxTokens: number
  timeoutMs?: number
  operationType?: DeepSeekOperationType
  triggerReason?: DeepSeekTriggerReason
}): Promise<DeepSeekDetailedResult> {
  const apiKey = getApiKey()
  if (!apiKey) {
    return { ok: false, error: 'NO_API_KEY', message: 'Clé API DeepSeek absente.' }
  }

  const opType = args.operationType ?? 'APP_KNOWLEDGE'
  const triggerReason =
    args.triggerReason ??
    (opType === 'BLOCK_DECISION'
      ? 'BLOCK_NO_LOCAL_DECISION'
      : opType === 'UNLOCK_REVIEW'
        ? 'UNLOCK_REQUIRES_SEMANTIC_REVIEW'
        : 'APP_PROFILE_UNRESOLVED_REQUIRED_NOW')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), args.timeoutMs ?? REQUEST_TIMEOUT_MS)
  const startTime = Date.now()
  const model = getModelName()

  try {
    const response = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: args.system },
          { role: 'user', content: args.user },
        ],
        temperature: 0,
        max_tokens: args.maxTokens,
        response_format: { type: 'json_object' },
        thinking: { type: 'disabled' },
        reasoning_effort: 'none',
      }),
      signal: controller.signal,
    })

    const latencyMs = Date.now() - startTime

    if (!response.ok) {
      log.warn('[deepseek] réponse HTTP non-OK', { status: response.status })
      deepSeekMetrics.recordCall({
        operationType: opType,
        triggerReason,
        latencyMs,
        inputTokens: 0,
        outputTokens: 0,
        promptCacheHitTokens: 0,
        promptCacheMissTokens: 0,
        model,
        thinkingMode: 'disabled',
        success: false,
        error: `HTTP ${response.status}`,
      })
      return {
        ok: false,
        error: 'HTTP_ERROR',
        status: response.status,
        message: `Erreur HTTP ${response.status}`,
      }
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
      usage?: {
        prompt_tokens?: number
        completion_tokens?: number
        total_tokens?: number
        prompt_cache_hit_tokens?: number
        prompt_cache_miss_tokens?: number
        prompt_tokens_details?: {
          cached_tokens?: number
        }
      }
    }

    const inputTokens = data.usage?.prompt_tokens ?? 0
    const outputTokens = data.usage?.completion_tokens ?? 0
    const promptCacheHitTokens =
      data.usage?.prompt_cache_hit_tokens ?? data.usage?.prompt_tokens_details?.cached_tokens ?? 0
    const promptCacheMissTokens =
      data.usage?.prompt_cache_miss_tokens ?? Math.max(0, inputTokens - promptCacheHitTokens)

    deepSeekMetrics.recordCall({
      operationType: opType,
      triggerReason,
      latencyMs,
      inputTokens,
      outputTokens,
      promptCacheHitTokens,
      promptCacheMissTokens,
      model,
      thinkingMode: 'disabled',
      success: true,
    })

    const extracted = extractJsonObject(data.choices?.[0]?.message?.content ?? '')
    if (!extracted) {
      return { ok: false, error: 'UNREADABLE_JSON', message: 'Réponse IA illisible.' }
    }
    return { ok: true, data: extracted }
  } catch (err) {
    const latencyMs = Date.now() - startTime
    const isAbort = err instanceof Error && err.name === 'AbortError'
    const errorType: DeepSeekApiErrorType = isAbort ? 'TIMEOUT' : 'NETWORK_ERROR'
    const message = isAbort ? 'Délai d’attente DeepSeek dépassé.' : 'Erreur réseau DeepSeek.'

    log.warn('[deepseek] appel échoué', err)
    deepSeekMetrics.recordCall({
      operationType: opType,
      triggerReason,
      latencyMs,
      inputTokens: 0,
      outputTokens: 0,
      promptCacheHitTokens: 0,
      promptCacheMissTokens: 0,
      model,
      thinkingMode: 'disabled',
      success: false,
      error: err instanceof Error ? err.message : String(err),
    })
    return { ok: false, error: errorType, message }
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Appel générique attendant une réponse JSON.
 * Renvoie `Record<string, unknown>` ou `null` en cas d'erreur.
 */
export async function askDeepSeekJson(args: {
  system: string
  user: string
  maxTokens: number
  timeoutMs?: number
  operationType?: DeepSeekOperationType
  triggerReason?: DeepSeekTriggerReason
}): Promise<Record<string, unknown> | null> {
  const result = await askDeepSeekJsonDetailed(args)
  return result.ok ? result.data : null
}

export type JustificationVerdict = {
  valid: boolean
  reason: string
}

export type JudgeContext = {
  appName?: string
}

/**
 * Lit une valeur d'environnement en cherchant d'abord dans `process.env`
 * (production, injecté par Electron), puis en parsant le fichier `.env` à la
 * racine du projet (dev). Évite d'ajouter `dotenv` comme dépendance.
 *
 * Candidate locations : process.cwd(), resourcesPath, __dirname/../../../
 */
function readEnvValue(key: string): string | undefined {
  if (process.env[key]) return process.env[key]

  const candidates = [
    join(process.cwd(), '.env'),
  ]
  // En production packagée, le .env peut vivre à côté de l'exécutable.
  const resourcesPath = process.env['RESOURCES_PATH']
  if (resourcesPath) candidates.push(join(resourcesPath, '.env'))
  // Depuis src/main/blocking/, on remonte jusqu'à la racine du repo (dev).
  candidates.push(join(__dirname, '..', '..', '..', '..', '.env'))

  for (const candidate of candidates) {
    try {
      if (!existsSync(candidate)) continue
      const content = readFileSync(candidate, 'utf8')
      const match = content.match(new RegExp(`^${key}=(.*)$`, 'mu'))
      if (match && match[1]) {
        return match[1].trim().replace(/^["']|["']$/g, '')
      }
    } catch {
      // Fichier illisible ou introuvable, on essaie le suivant.
    }
  }
  return undefined
}

let cachedApiKey: string | null | undefined

function getApiKey(): string | null {
  if (cachedApiKey !== undefined) return cachedApiKey
  const key = readEnvValue('DEEPSEEK_API_KEY')
  cachedApiKey = key && key.length > 0 ? key : null
  if (!cachedApiKey) {
    log.warn('[deepseek] DEEPSEEK_API_KEY manquant — le jugement de justification sera désactivé')
  }
  return cachedApiKey
}

/** Extrait un objet JSON depuis une réponse de modèle qui peut l'enrober de prose ou être tronquée. */
function extractJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim()
  // Cas direct : la réponse est du JSON pur.
  try {
    return JSON.parse(trimmed) as Record<string, unknown>
  } catch {
    // Continuer vers l'extraction par regex ou réparation.
  }
  // Cas enrobé : on cherche le premier { ... } équilibré.
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>
    } catch {
      // Échec silencieux.
    }
  }

  // Cas tronqué (ex: streaming interrompu ou maxTokens atteint) : tenter de refermer la structure valide
  if (start >= 0) {
    let lastBrace = trimmed.lastIndexOf('}')
    while (lastBrace > start) {
      const candidate = trimmed.slice(start, lastBrace + 1)
      try {
        return JSON.parse(candidate) as Record<string, unknown>
      } catch {
        /* ignore parsing error */
      }
      try {
        return JSON.parse(candidate + '\n]}') as Record<string, unknown>
      } catch {
        /* ignore parsing error */
      }
      try {
        return JSON.parse(candidate + '\n}') as Record<string, unknown>
      } catch {
        /* ignore parsing error */
      }
      lastBrace = trimmed.lastIndexOf('}', lastBrace - 1)
    }
  }

  return null
}

function coerceVerdict(raw: unknown): JustificationVerdict {
  if (typeof raw !== 'object' || raw === null) {
    return { valid: false, reason: 'Réponse IA illisible — déblocage refusé par sécurité.' }
  }
  const obj = raw as Record<string, unknown>
  const valid = obj['valid'] === true || obj['allowed'] === true || obj['ok'] === true
  const reasonRaw = obj['reason'] ?? obj['raison'] ?? obj['explanation']
  const reason =
    typeof reasonRaw === 'string' && reasonRaw.trim().length > 0
      ? reasonRaw.trim().slice(0, 280)
      : valid
        ? 'Justification acceptée.'
        : 'Justification insuffisante.'
  return { valid, reason }
}

/**
 * Demande à DeepSeek de juger si une justification de déblocage est valable.
 *
 * En cas d'erreur réseau / IA indisponible / clé manquante, renvoie toujours
 * `{ valid: false }` — on ne débloque jamais par défaut, par sécurité.
 */
export async function judgeJustification(
  text: string,
  context: JudgeContext = {},
): Promise<JustificationVerdict> {
  const apiKey = getApiKey()
  if (!apiKey) {
    return {
      valid: false,
      reason: "L'IA n'est pas configurée. Déblocage refusé par sécurité.",
    }
  }

  const cleaned = text.trim().slice(0, 1000)
  if (cleaned.length < 5) {
    return { valid: false, reason: 'Justification trop courte.' }
  }

  const systemPrompt =
    'Tu es un gardien de discipline. Un utilisateur tente de débloquer une application bloquée ' +
    'par Vethos (app de focus). Il te donne sa justification. Tu dois juger si elle est valable. ' +
    'Sois strict : une vraie raison professionnelle ou urgente seulement. ' +
    'Réponds UNIQUEMENT par un objet JSON compact avec : ' +
    '{"valid": boolean, "reason": "explication courte en français, max 200 caractères"}. ' +
    'Pas de prose autour du JSON.'

  const userPrompt = context.appName
    ? `Application demandée : ${context.appName}\nJustification : "${cleaned}"`
    : `Justification : "${cleaned}"`

  const result = await askDeepSeekJsonDetailed({
    system: systemPrompt,
    user: userPrompt,
    maxTokens: 200,
    timeoutMs: REQUEST_TIMEOUT_MS,
    operationType: 'UNLOCK_REVIEW',
    triggerReason: 'UNLOCK_REQUIRES_SEMANTIC_REVIEW',
  })

  if (!result.ok) {
    if (result.error === 'HTTP_ERROR') {
      return { valid: false, reason: `L'IA a renvoyé une erreur (${result.status}). Réessaie.` }
    }
    if (result.error === 'TIMEOUT') {
      return { valid: false, reason: 'Le jugement a expiré. Réessaie.' }
    }
    if (result.error === 'NETWORK_ERROR') {
      return { valid: false, reason: "L'IA est injoignable. Réessaie plus tard." }
    }
    return { valid: false, reason: 'Réponse IA illisible.' }
  }

  return coerceVerdict(result.data)
}
