import type { DecisionLogEntry } from './engine-results'

export const DEFAULT_DECISION_LOG_LIMIT = 500
export const MAX_DECISION_LOG_LIMIT = 1000

function safeLimit(limit: number): number {
  if (!Number.isFinite(limit)) return DEFAULT_DECISION_LOG_LIMIT
  return Math.max(1, Math.min(MAX_DECISION_LOG_LIMIT, Math.round(limit)))
}

function normalizeLoggedDomain(host: string): string {
  return host.trim().toLowerCase().replace(/^www\./u, '')
}

function stripUrlDetailsFromString(value: string): string {
  return value
    .replace(/https?:\/\/([^/\s?#]+)[^\s]*/giu, (_match, host: string) =>
      normalizeLoggedDomain(host),
    )
    .replace(/\bwww\.([a-z0-9.-]+\.[a-z]{2,})(?:[/?#][^\s]*)?/giu, (_match, host: string) =>
      normalizeLoggedDomain(host),
    )
    .replace(
      /\b((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,})(?:\/[^\s]*)/giu,
      (_match, host: string) => normalizeLoggedDomain(host),
    )
}

function stripUrlDetails(value: unknown): unknown {
  if (typeof value === 'string') {
    return stripUrlDetailsFromString(value)
  }
  if (Array.isArray(value)) return value.map(stripUrlDetails)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, stripUrlDetails(nested)]),
    )
  }
  return value
}

export function sanitizeDecisionLogEntry(entry: DecisionLogEntry): DecisionLogEntry {
  return stripUrlDetails(entry) as DecisionLogEntry
}

export function appendDecisionLogEntry(
  entries: DecisionLogEntry[],
  entry: DecisionLogEntry,
  limit = DEFAULT_DECISION_LOG_LIMIT,
): DecisionLogEntry[] {
  const next = [...entries, sanitizeDecisionLogEntry(entry)]
  return next.slice(-safeLimit(limit))
}
