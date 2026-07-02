import { app } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type {
  DeepSeekChatMessage,
  DeepSeekChatRequest,
  DeepSeekChatResult,
  SemanticValidationPayload,
  SemanticValidationResult,
} from '@shared/deepseek'

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions'
const DEFAULT_DEEPSEEK_MODEL = 'deepseek-v4-flash'
const API_KEY_PLACEHOLDER = 'ta_clé_complète_ici'

type DeepSeekApiResponse = {
  id?: string
  model?: string
  choices?: Array<{
    message?: {
      content?: string
      reasoning_content?: string
    }
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
  error?: {
    message?: string
  }
}

function parseEnvFile(path: string): Record<string, string> {
  const values: Record<string, string> = {}
  const content = readFileSync(path, 'utf8')
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
    if (!match) continue
    const key = match[1]!
    let value = match[2]!.trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    values[key] = value
  }
  return values
}

function readEnvValue(key: string): string | undefined {
  const fromProcess = process.env[key]?.trim()
  if (fromProcess) return fromProcess

  const candidates = [
    join(process.cwd(), '.env'),
    join(app.getAppPath(), '.env'),
    join(__dirname, '../../../.env'),
  ]
  for (const path of [...new Set(candidates)]) {
    if (!existsSync(path)) continue
    const value = parseEnvFile(path)[key]?.trim()
    if (value) return value
  }

  return undefined
}

function getDeepSeekApiKey(): string {
  const apiKey = readEnvValue('DEEPSEEK_API_KEY')
  if (!apiKey || apiKey === API_KEY_PLACEHOLDER) {
    throw new Error('DEEPSEEK_API_KEY manquante dans .env')
  }
  return apiKey
}

export function normalizeMessages(request: DeepSeekChatRequest | undefined): DeepSeekChatMessage[] {
  const source = request ?? {}
  const messages: DeepSeekChatMessage[] =
    source.messages && source.messages.length > 0
      ? source.messages
      : source.prompt
        ? [{ role: 'user', content: source.prompt }]
        : []

  if (messages.length === 0) {
    throw new Error('DeepSeek exige au moins un message ou un prompt.')
  }

  return messages.map((message) => {
    if (!['system', 'user', 'assistant'].includes(message.role)) {
      throw new Error(`Role DeepSeek invalide: ${message.role}`)
    }
    const content = message.content.trim()
    if (!content) throw new Error('Les messages DeepSeek ne peuvent pas etre vides.')
    return { role: message.role, content }
  })
}

export async function sendDeepSeekChat(
  request: DeepSeekChatRequest | undefined,
): Promise<DeepSeekChatResult> {
  const source = request ?? {}
  const messages = normalizeMessages(source)
  const apiKey = getDeepSeekApiKey()

  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: source.model ?? DEFAULT_DEEPSEEK_MODEL,
      messages,
      thinking: source.thinking ?? { type: 'disabled' },
      ...(source.temperature === undefined ? {} : { temperature: source.temperature }),
      ...(source.maxTokens === undefined ? {} : { max_tokens: source.maxTokens }),
    }),
  })

  const payload = (await response.json().catch(() => ({}))) as DeepSeekApiResponse
  if (!response.ok) {
    throw new Error(payload.error?.message ?? `DeepSeek HTTP ${response.status}`)
  }

  const message = payload.choices?.[0]?.message
  const content = message?.content?.trim() ?? ''
  const reasoningContent = message?.reasoning_content?.trim()
  if (!content && !reasoningContent) throw new Error('DeepSeek a renvoye une reponse vide.')

  return {
    id: payload.id,
    model: payload.model,
    content,
    reasoningContent,
    usage: payload.usage
      ? {
          promptTokens: payload.usage.prompt_tokens,
          completionTokens: payload.usage.completion_tokens,
          totalTokens: payload.usage.total_tokens,
        }
      : undefined,
  }
}

function clampScore(value: unknown): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.max(0, Math.min(10, numeric))
}

function extractJsonObject(content: string): Record<string, unknown> {
  const trimmed = content.trim()
  const direct = JSON.parse(trimmed) as Record<string, unknown>
  return direct
}

function parseSemanticResult(content: string): SemanticValidationResult {
  let parsed: Record<string, unknown>
  try {
    parsed = extractJsonObject(content)
  } catch {
    const match = content.match(/\{[\s\S]*\}/)
    parsed = match ? (JSON.parse(match[0]) as Record<string, unknown>) : {}
  }
  const intentionScore = clampScore(parsed.intentionScore ?? parsed.intention_score)
  const truthScore = clampScore(parsed.truthScore ?? parsed.truth_score)
  const totalScore = Math.min(intentionScore, truthScore)
  return {
    intentionScore,
    truthScore,
    totalScore,
    allowed: totalScore >= 7,
    allowMinutes: totalScore >= 7 ? 10 : 0,
    reason:
      typeof parsed.reason === 'string' && parsed.reason.trim()
        ? parsed.reason.trim().slice(0, 280)
        : totalScore >= 7
          ? 'Semantic relation accepted.'
          : 'This site does not have a strong semantic relation to the active task.',
    rawContent: content,
  }
}

export async function evaluateSemanticAccess(
  payload: SemanticValidationPayload,
): Promise<SemanticValidationResult> {
  const result = await sendDeepSeekChat({
    temperature: 0,
    maxTokens: 220,
    messages: [
      {
        role: 'system',
        content:
          'You are Vethos semantic focus guard. Return only compact JSON with intentionScore, truthScore, totalScore, and reason. Scores are 0-10. intentionScore measures coherence between the user justification and active_task. truthScore measures coherence between the user justification and scraped_metadata. totalScore must be min(intentionScore, truthScore).',
      },
      {
        role: 'user',
        content: JSON.stringify(payload),
      },
    ],
  })

  return parseSemanticResult(result.content || result.reasoningContent || '{}')
}

export async function evaluateSiteAccessDirect(
  activeTask: any | null,
  metadata: any,
): Promise<{ allowed: boolean; reason: string }> {
  const prompt = activeTask
    ? `Evaluate if the visited website (Domain: "${metadata.domain}", Title: "${metadata.title}", Description: "${metadata.description || ''}") is a useful tool or relevant resource for the active task (Title: "${activeTask.title}", Objective: "${activeTask.objectiveName || ''}").`
    : `Evaluate if the visited website (Domain: "${metadata.domain}", Title: "${metadata.title}", Description: "${metadata.description || ''}") is generally a utilitarian/work tool (like search engines, code editors, documentation, libraries, productivity tools, business utilities) or a general distraction (like social media, entertainment, streaming, video games, shopping, non-work forums).`

  const result = await sendDeepSeekChat({
    temperature: 0,
    maxTokens: 200,
    messages: [
      {
        role: 'system',
        content:
          'You are Vethos semantic focus guard. Return ONLY a compact JSON object with: "allowed" (boolean: true if the site is relevant/useful, false if it is a distraction or irrelevant), and "reason" (string, max 200 chars, in French, explaining why). Do not include any other text or markdown formatting.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
  })

  try {
    const parsed = extractJsonObject(result.content || result.reasoningContent || '{}')
    return {
      allowed: typeof parsed.allowed === 'boolean' ? parsed.allowed : parsed.allowed === 'true',
      reason: String(parsed.reason || ''),
    }
  } catch (err) {
    console.error('[deepseek-gateway] Error parsing direct evaluation:', err)
    return {
      allowed: true,
      reason: 'Erreur lors de l\'évaluation par le Coach.',
    }
  }
}
