import log from '@main/logging/setup'

export type DeepSeekOperationType = 'BLOCK_DECISION' | 'APP_KNOWLEDGE' | 'UNLOCK_REVIEW'

export const DEEPSEEK_TRIGGER_REASONS = {
  BLOCK_NO_LOCAL_DECISION: 'BLOCK_NO_LOCAL_DECISION',
  APP_PROFILE_UNRESOLVED_REQUIRED_NOW: 'APP_PROFILE_UNRESOLVED_REQUIRED_NOW',
  UNLOCK_REQUIRES_SEMANTIC_REVIEW: 'UNLOCK_REQUIRES_SEMANTIC_REVIEW',
} as const

export type DeepSeekTriggerReason =
  (typeof DEEPSEEK_TRIGGER_REASONS)[keyof typeof DEEPSEEK_TRIGGER_REASONS]

export type AvoidedCallReason =
  | 'localDecisionCacheHit'
  | 'builtinCatalogHit'
  | 'localRuleHit'
  | 'existingAppKnowledgeHit'
  | 'unresolvedDeferred'

export interface DeepSeekCallMetric {
  id: string
  timestamp: string
  operationType: DeepSeekOperationType
  triggerReason: DeepSeekTriggerReason
  latencyMs: number
  inputTokens: number
  outputTokens: number
  promptCacheHitTokens: number
  promptCacheMissTokens: number
  model: string
  thinkingMode: string
  success: boolean
  error?: string
}

export interface DeepSeekAvoidedMetric {
  reason: AvoidedCallReason
  operationType: DeepSeekOperationType
  details?: string
  timestamp: string
}

export interface DeepSeekMetricsSummary {
  totalCalls: number
  callsByOperation: Record<DeepSeekOperationType, number>
  callsByTriggerReason: Record<DeepSeekTriggerReason, number>
  totalInputTokens: number
  totalOutputTokens: number
  totalPromptCacheHitTokens: number
  totalPromptCacheMissTokens: number
  totalLatencyMs: number
  averageLatencyMs: number
  successCount: number
  failureCount: number
  avoidedCalls: Record<AvoidedCallReason, number>
  recentCalls: DeepSeekCallMetric[]
}

class DeepSeekMetricsCollector {
  private calls: DeepSeekCallMetric[] = []
  private avoided: DeepSeekAvoidedMetric[] = []

  public recordCall(metric: Omit<DeepSeekCallMetric, 'id' | 'timestamp'>): void {
    const entry: DeepSeekCallMetric = {
      ...metric,
      id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
    }
    this.calls.push(entry)
    // Keep max 500 recent records in memory
    if (this.calls.length > 500) {
      this.calls.shift()
    }

    log.info(
      `[deepseek-metrics] CALL: op=${entry.operationType} trigger=${entry.triggerReason} latency=${entry.latencyMs}ms ` +
        `inTokens=${entry.inputTokens} outTokens=${entry.outputTokens} cacheHitTokens=${entry.promptCacheHitTokens} ` +
        `cacheMissTokens=${entry.promptCacheMissTokens} success=${entry.success}`,
    )
  }

  public recordAvoided(reason: AvoidedCallReason, operationType: DeepSeekOperationType, details?: string): void {
    this.avoided.push({
      reason,
      operationType,
      details,
      timestamp: new Date().toISOString(),
    })
    log.info(`[deepseek-metrics] AVOIDED: reason=${reason} op=${operationType} ${details ? `(${details})` : ''}`)
  }

  public getSummary(): DeepSeekMetricsSummary {
    const callsByOperation: Record<DeepSeekOperationType, number> = {
      BLOCK_DECISION: 0,
      APP_KNOWLEDGE: 0,
      UNLOCK_REVIEW: 0,
    }
    const callsByTriggerReason: Record<DeepSeekTriggerReason, number> = {
      BLOCK_NO_LOCAL_DECISION: 0,
      APP_PROFILE_UNRESOLVED_REQUIRED_NOW: 0,
      UNLOCK_REQUIRES_SEMANTIC_REVIEW: 0,
    }
    const avoidedCalls: Record<AvoidedCallReason, number> = {
      localDecisionCacheHit: 0,
      builtinCatalogHit: 0,
      localRuleHit: 0,
      existingAppKnowledgeHit: 0,
      unresolvedDeferred: 0,
    }

    let totalInputTokens = 0
    let totalOutputTokens = 0
    let totalPromptCacheHitTokens = 0
    let totalPromptCacheMissTokens = 0
    let totalLatencyMs = 0
    let successCount = 0
    let failureCount = 0

    for (const c of this.calls) {
      callsByOperation[c.operationType] = (callsByOperation[c.operationType] || 0) + 1
      callsByTriggerReason[c.triggerReason] = (callsByTriggerReason[c.triggerReason] || 0) + 1
      totalInputTokens += c.inputTokens
      totalOutputTokens += c.outputTokens
      totalPromptCacheHitTokens += c.promptCacheHitTokens
      totalPromptCacheMissTokens += c.promptCacheMissTokens
      totalLatencyMs += c.latencyMs
      if (c.success) successCount++
      else failureCount++
    }

    for (const a of this.avoided) {
      avoidedCalls[a.reason] = (avoidedCalls[a.reason] || 0) + 1
    }

    return {
      totalCalls: this.calls.length,
      callsByOperation,
      callsByTriggerReason,
      totalInputTokens,
      totalOutputTokens,
      totalPromptCacheHitTokens,
      totalPromptCacheMissTokens,
      totalLatencyMs,
      averageLatencyMs: this.calls.length > 0 ? Math.round(totalLatencyMs / this.calls.length) : 0,
      successCount,
      failureCount,
      avoidedCalls,
      recentCalls: [...this.calls].slice(-20),
    }
  }

  public reset(): void {
    this.calls = []
    this.avoided = []
  }
}

export const deepSeekMetrics = new DeepSeekMetricsCollector()
