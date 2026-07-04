import type { AppBlockExplanation } from '@shared/schemas'
import { COACH_CORE_DOCTRINE_FR, COACH_JSON_REASON_DOCTRINE_FR } from '@shared/coach-personality'
import { sendDeepSeekChat } from '@main/deepseek/gateway'

export type AppExplanationFocus = {
  focusKind: 'task' | 'objective' | 'session'
  focusLabel: string
  taskId?: string
  taskTitle?: string
  objectiveId?: string
  objectiveName?: string
}

export type AppExplanationCoachResult = {
  allowed: boolean
  reason: string
  allowMinutes: number
  necessityScore: number
  credibilityScore: number
  urgencyScore: number
}

function clampScore(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.min(10, parsed))
}

function parseObject(content: string): Record<string, unknown> {
  try {
    return JSON.parse(content.trim()) as Record<string, unknown>
  } catch {
    const match = content.match(/\{[\s\S]*\}/u)
    return match ? (JSON.parse(match[0]) as Record<string, unknown>) : {}
  }
}

export function parseAppExplanationCoachResult(content: string): AppExplanationCoachResult {
  const parsed = parseObject(content)
  const necessityScore = clampScore(parsed.necessityScore ?? parsed.necessity_score)
  const credibilityScore = clampScore(parsed.credibilityScore ?? parsed.credibility_score)
  const urgencyScore = clampScore(parsed.urgencyScore ?? parsed.urgency_score)
  const recommendation = String(parsed.decision ?? parsed.recommendation ?? '').toLowerCase()
  const allowed =
    ['allow', 'allowed', 'autoriser', 'accorde'].includes(recommendation) &&
    necessityScore >= 9 &&
    credibilityScore >= 9 &&
    urgencyScore >= 8
  const requestedMinutes = Math.round(Number(parsed.allowMinutes ?? parsed.allow_minutes))
  const allowMinutes = allowed
    ? Math.max(3, Math.min(10, Number.isFinite(requestedMinutes) ? requestedMinutes : 5))
    : 0
  const reason =
    typeof parsed.reason === 'string' && parsed.reason.trim()
      ? parsed.reason.trim().slice(0, 500)
      : allowed
        ? 'Accord temporaire : le besoin est concret et limité.'
        : "Je refuse pour l'instant : cette explication ne justifie pas d'interrompre ton objectif. Reviens à la prochaine action utile."

  return {
    allowed,
    reason,
    allowMinutes,
    necessityScore,
    credibilityScore,
    urgencyScore,
  }
}

export async function evaluateAppExplanation(args: {
  processName: string
  appName: string
  explanation: string
  focus: AppExplanationFocus
  previousExplanations: AppBlockExplanation[]
}): Promise<AppExplanationCoachResult> {
  const history = args.previousExplanations.slice(0, 30).map((entry) => ({
    at: entry.createdAt,
    app: entry.appName,
    explanation: entry.explanation,
    focus: entry.focusLabel,
    decision: entry.decision,
    reason: entry.reason,
    allowMinutes: entry.allowMinutes,
  }))

  const response = await sendDeepSeekChat({
    temperature: 0,
    maxTokens: 280,
    messages: [
      {
        role: 'system',
        content: `${COACH_CORE_DOCTRINE_FR}

Tu juges une demande d'exception pour ouvrir une application bloquée pendant un objectif prioritaire.

Règles de décision :
- Une exception est rare.
- Elle exige un besoin concret, indispensable maintenant, crédible et suffisamment urgent.
- Une envie, une pause, une formulation vague, une promesse, une excuse répétée ou une justification sans lien direct doit être refusée.
- Compare obligatoirement avec l'historique pour détecter répétitions, contradictions et contournements.
- Si l'accès est accordé, il doit être minimal, ciblé et temporaire.
- N'accorde jamais plus de 10 minutes.

${COACH_JSON_REASON_DOCTRINE_FR}

Réponds uniquement en JSON compact valide, sans markdown :
{"decision":"allow"|"deny","necessityScore":0-10,"credibilityScore":0-10,"urgencyScore":0-10,"allowMinutes":0|3-10,"reason":"..."}`,
      },
      {
        role: 'user',
        content: JSON.stringify({
          blocked_application: { name: args.appName, process: args.processName },
          protected_focus: args.focus,
          current_explanation: args.explanation,
          previous_explanations: history,
        }),
      },
    ],
  })

  return parseAppExplanationCoachResult(response.content || response.reasoningContent || '{}')
}
