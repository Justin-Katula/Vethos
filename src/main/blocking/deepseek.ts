import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import log from '@main/logging/setup'

/**
 * Gateway DeepSeek pour le jugement des justifications de déblocage.
 *
 * Périmètre volontairement réduit (Partie 5 du document) : juste une fonction
 * `judgeJustification` qui répond oui/non avec une raison. Pas de système de
 * fermeté/paliers/coach — l'IA répond, point.
 *
 * Utilise le `fetch` global (Node 18+, embarqué dans Electron 30). Pas de
 * dépendance npm à ajouter.
 */

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions'
const DEFAULT_DEEPSEEK_MODEL = 'deepseek-v4-flash'
const REQUEST_TIMEOUT_MS = 15_000

function getModelName(): string {
  return readEnvValue('DEEPSEEK_MODEL') ?? DEFAULT_DEEPSEEK_MODEL
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

/** Extrait un objet JSON depuis une réponse de modèle qui peut l'enrober de prose. */
function extractJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim()
  // Cas direct : la réponse est du JSON pur.
  try {
    return JSON.parse(trimmed) as Record<string, unknown>
  } catch {
    // Continuer vers l'extraction par regex.
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

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: getModelName(),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0,
        max_tokens: 200,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errText = typeof response.text === 'function' ? await response.text().catch(() => '') : ''
      log.warn('[deepseek] réponse HTTP non-OK', { status: response.status, body: errText })
      return {
        valid: false,
        reason: `L'IA a renvoyé une erreur (${response.status}). Réessaie.`,
      }
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = data.choices?.[0]?.message?.content ?? ''
    const parsed = extractJsonObject(content)
    if (!parsed) {
      log.warn('[deepseek] impossible de parser la réponse', { content })
      return { valid: false, reason: 'Réponse IA illisible.' }
    }
    return coerceVerdict(parsed)
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { valid: false, reason: 'Le jugement a expiré. Réessaie.' }
    }
    log.error('[deepseek] erreur réseau', err)
    return { valid: false, reason: "L'IA est injoignable. Réessaie plus tard." }
  } finally {
    clearTimeout(timeout)
  }
}
