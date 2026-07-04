import { normalizeUserModelDomain, type UserAppSitePreference, type UserBehaviorEvent, type UserCorrection } from '@shared/user-model'

export type RegistryPreferenceEntry = { identifier: string; kind: 'app' | 'site'; category?: string; demoted?: boolean; usefulFor?: { objectives?: string[]; standaloneTasks?: string[] } }
type ContextRule = UserAppSitePreference['contextRules'][number]
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)))

export function mergeContextRule(rules: readonly ContextRule[], incoming: ContextRule): ContextRule[] {
  const key = (rule: ContextRule) => `${rule.contextType}:${rule.contextId ?? rule.domain ?? '*'}`
  const weights = { fallback: 1, system: 2, coach: 3, usage: 4, user: 5 }
  const map = new Map(rules.map((rule) => [key(rule), rule]))
  const current = map.get(key(incoming))
  if (!current || weights[incoming.source] > weights[current.source] || (weights[incoming.source] === weights[current.source] && incoming.confidence >= current.confidence)) map.set(key(incoming), incoming)
  return [...map.values()]
}

function rulesFor(entry: RegistryPreferenceEntry, events: readonly UserBehaviorEvent[], corrections: readonly UserCorrection[], now: string): ContextRule[] {
  let rules: ContextRule[] = []
  for (const id of entry.usefulFor?.standaloneTasks ?? []) rules = mergeContextRule(rules, { contextType: 'task', contextId: id, classification: 'useful', confidence: 85, source: 'user', reasons: ['Déclaré utile pour cette tâche.'], updatedAt: now })
  for (const id of entry.usefulFor?.objectives ?? []) rules = mergeContextRule(rules, { contextType: 'objective', contextId: id, classification: 'useful', confidence: 85, source: 'user', reasons: ['Déclaré utile pour cet objectif.'], updatedAt: now })
  const openings = events.filter((event) => event.targetId === entry.identifier && (event.type === 'app_opened_during_session' || event.type === 'site_opened_during_session')).length
  if (openings >= 2) rules = mergeContextRule(rules, { contextType: 'domain', domain: 'discipline', classification: 'distraction', confidence: clamp(45 + openings * 8), source: 'usage', reasons: [`Ouvert ${openings} fois pendant des sessions protégées.`], updatedAt: now })
  const relevant = corrections.filter((correction) => correction.targetId === entry.identifier && (correction.type === 'app_classification_corrected' || correction.type === 'site_classification_corrected'))
  for (const correction of relevant) {
    const classification = typeof correction.newValue === 'string' && ['useful','neutral','distraction','conditional'].includes(correction.newValue) ? correction.newValue as ContextRule['classification'] : 'neutral'
    const suspicious = correction.context?.duringSession && classification === 'useful'
    rules = mergeContextRule(rules, { contextType: correction.context?.taskId ? 'task' : correction.context?.objectiveId ? 'objective' : 'domain', contextId: correction.context?.taskId ?? correction.context?.objectiveId, domain: correction.context?.taskId || correction.context?.objectiveId ? undefined : 'discipline', classification, confidence: suspicious ? 35 : correction.strength === 'permanent' ? 100 : correction.strength === 'strong' ? 85 : 60, source: 'user', reasons: [suspicious ? 'Correction faite pendant une session protégée; confiance limitée.' : 'Correction explicite de l’utilisateur.'], updatedAt: correction.createdAt })
  }
  if (!rules.length) rules.push({ contextType: 'domain', domain: 'personal', classification: entry.demoted ? 'distraction' : 'neutral', confidence: entry.demoted ? 75 : 20, source: entry.demoted ? 'user' : 'fallback', reasons: [entry.demoted ? 'Classé comme distraction dans le registre.' : 'Aucun signal contextuel suffisant.'], updatedAt: now })
  return rules
}

export function buildAppSitePreferenceModel(registry: readonly RegistryPreferenceEntry[] = [], _tasks: readonly unknown[] = [], _objectives: readonly unknown[] = [], events: readonly UserBehaviorEvent[] = [], corrections: readonly UserCorrection[] = [], _coachResults?: unknown, context: { now?: string } = {}): UserAppSitePreference[] {
  const now = context.now ?? new Date().toISOString()
  return registry.map((entry) => {
    const identifier = entry.kind === 'site' ? normalizeUserModelDomain(entry.identifier) : entry.identifier
    const normalized = { ...entry, identifier }
    return { identifier, kind: entry.kind, globalCategory: entry.category, contextRules: rulesFor(normalized, events, corrections, now), updatedAt: now }
  })
}

export function getBestClassificationForContext(preferences: readonly UserAppSitePreference[], identifier: string, context: { taskId?: string; objectiveId?: string; domain?: ContextRule['domain'] }): ContextRule | undefined {
  const preference = preferences.find((item) => item.identifier === identifier || (item.kind === 'site' && item.identifier === normalizeUserModelDomain(identifier)))
  if (!preference) return undefined
  return preference.contextRules.find((rule) => rule.contextType === 'task' && rule.contextId === context.taskId)
    ?? preference.contextRules.find((rule) => rule.contextType === 'objective' && rule.contextId === context.objectiveId)
    ?? preference.contextRules.find((rule) => rule.contextType === 'domain' && rule.domain === context.domain)
    ?? preference.contextRules.find((rule) => rule.source === 'fallback')
}
