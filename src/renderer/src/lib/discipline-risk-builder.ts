import { normalizeUserModelDomain, type UserBehaviorEvent, type UserCorrection, type UserDisciplineContext, type UserDisciplineModel } from '@shared/user-model'

type RegistryEntry = { identifier?: string; domain?: string; kind?: 'app' | 'site'; classified?: boolean; demoted?: boolean; category?: string }
type SessionEntry = { status?: string; objectiveId?: string; context?: string }
type UnlockEntry = { decision?: string; credibilityScore?: number; explanationHash?: string; targetId?: string; targetType?: string; context?: string }
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(Number.isFinite(n) ? n : 0)))

export function buildDisciplineModel(
  events: readonly UserBehaviorEvent[] = [],
  sessions: readonly SessionEntry[] = [],
  unlockHistory: readonly UnlockEntry[] = [],
  appRegistry: readonly RegistryEntry[] = [],
  siteRegistry: readonly RegistryEntry[] = [],
  corrections: readonly UserCorrection[] = [],
  context: { now?: string } = {},
): UserDisciplineModel {
  const now = context.now ?? new Date().toISOString()
  const requests = events.filter((event) => event.type === 'unlock_requested').length + unlockHistory.length
  const refused = events.filter((event) => event.type === 'unlock_refused').length + unlockHistory.filter((item) => item.decision === 'denied').length
  const aborted = events.filter((event) => event.type === 'session_aborted').length + sessions.filter((item) => item.status === 'aborted').length
  const completed = events.filter((event) => event.type === 'session_completed').length + sessions.filter((item) => item.status === 'completed').length
  const openings = events.filter((event) => event.type === 'app_opened_during_session' || event.type === 'site_opened_during_session')
  const globalDistractionRisk = clamp(20 + requests * 8 + refused * 10 + aborted * 9 + openings.length * 5 - completed * 4)
  const signalCount = requests + aborted + completed + openings.length
  const confidence = clamp(Math.min(90, 15 + signalCount * 6))
  const contexts = new Map<UserDisciplineContext, { risk: number; count: number }>()
  for (const event of events) {
    const value = event.metadata?.lifeArea
    if (typeof value !== 'string' || !['school','work','project','discipline','health','finance','future','personal'].includes(value)) continue
    const current = contexts.get(value as UserDisciplineContext) ?? { risk: 20, count: 0 }
    const risky = ['unlock_requested','unlock_refused','session_aborted','app_opened_during_session','site_opened_during_session'].includes(event.type)
    contexts.set(value as UserDisciplineContext, { risk: current.risk + (risky ? 12 : -4), count: current.count + 1 })
  }
  const riskByContext = [...contexts].map(([name, data]) => ({ context: name, risk: clamp(data.risk), confidence: clamp(data.count * 15) }))
  const riskItems = (kind: 'app' | 'site', registry: readonly RegistryEntry[]) => {
    const map = new Map<string, { count: number; contexts: Set<string> }>()
    for (const event of openings.filter((item) => item.targetType === kind)) {
      const raw = event.targetId ?? ''
      const id = kind === 'site' ? normalizeUserModelDomain(raw) : raw
      if (!id) continue
      const item = map.get(id) ?? { count: 0, contexts: new Set<string>() }
      item.count++
      if (typeof event.metadata?.lifeArea === 'string') item.contexts.add(event.metadata.lifeArea)
      map.set(id, item)
    }
    for (const item of registry.filter((entry) => entry.demoted)) {
      const raw = item.identifier ?? item.domain ?? ''
      const id = kind === 'site' ? normalizeUserModelDomain(raw) : raw
      if (id && !map.has(id)) map.set(id, { count: 1, contexts: new Set() })
    }
    return [...map].map(([identifier, data]) => ({
      identifier,
      riskScore: clamp(35 + data.count * 14),
      contexts: [...data.contexts],
      reasons: [`Ouvert ${data.count} fois pendant une session protégée.`],
    }))
  }
  const apps = riskItems('app', appRegistry)
  const sites = riskItems('site', siteRegistry)
  const hashes = unlockHistory.map((item) => item.explanationHash).filter(Boolean)
  const repeatedExcuses = hashes.length >= 2 && new Set(hashes).size < hashes.length
  const credibility = unlockHistory.map((item) => item.credibilityScore).filter((n): n is number => typeof n === 'number')
  const consistentCorrections = corrections.filter((item) => !item.context?.duringSession && (item.strength === 'strong' || item.strength === 'permanent')).length
  const reasons = signalCount ? [`${requests} demande(s) d’accès et ${aborted} session(s) interrompue(s) analysées.`] : ['Pas encore assez de signaux comportementaux.']
  if (consistentCorrections) reasons.push('Les corrections fortes faites hors session réduisent l’incertitude.')
  return {
    globalDistractionRisk: clamp(globalDistractionRisk - consistentCorrections * 3), confidence, reasons,
    riskByContext,
    riskyApps: apps,
    riskySites: sites.map((item) => ({ domain: item.identifier, riskScore: item.riskScore, contexts: item.contexts, reasons: item.reasons })),
    unlockPattern: { frequentRequests: requests >= 5, repeatedExcuses, contradictionRisk: clamp(refused * 12 + requests * 4), averageCredibility: credibility.length ? clamp(credibility.reduce((a,b)=>a+b,0)/credibility.length) : 0 },
    updatedAt: now,
  }
}
