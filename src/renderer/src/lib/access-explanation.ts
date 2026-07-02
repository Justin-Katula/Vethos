import type { SessionPlan } from '@shared/engine-results'
import type { Objective, RegistryItem, Task } from '@shared/schemas'

export type AppAccessExplanation = {
  targetKind: 'app' | 'site'
  identifier: string
  access: 'allowed' | 'blocked' | 'conditional' | 'unknown'
  reasons: string[]
  confidence: number
  relatedTaskId?: string
  relatedObjectiveId?: string
}

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

function targetIdentifier(target: string | RegistryItem): string {
  return typeof target === 'string' ? target : target.executableName ?? target.identifier
}

function registryUsefulFor(
  registryEntry: RegistryItem | undefined,
  task?: Task | null,
  objective?: Objective | null,
): boolean {
  if (!registryEntry) return false
  return (
    (task ? registryEntry.usefulFor.standaloneTasks.includes(task.id) : false) ||
    (objective ? registryEntry.usefulFor.objectives.includes(objective.id) : false) ||
    (task?.linkedObjectiveId ? registryEntry.usefulFor.objectives.includes(task.linkedObjectiveId) : false)
  )
}

function includesIdentifier(values: string[], identifier: string): boolean {
  const normalized = normalize(identifier)
  return values.some((value) => normalize(value) === normalized)
}

function explainAccess(args: {
  targetKind: 'app' | 'site'
  identifier: string
  sessionPlan: SessionPlan
  task?: Task | null
  objective?: Objective | null
  registryEntry?: RegistryItem
}): AppAccessExplanation {
  const allowedList = args.targetKind === 'app' ? args.sessionPlan.allowedApps : args.sessionPlan.allowedSites
  const blockedList = args.targetKind === 'app' ? args.sessionPlan.blockedApps : args.sessionPlan.blockedSites
  const useful = registryUsefulFor(args.registryEntry, args.task, args.objective)
  const reasons: string[] = []
  let access: AppAccessExplanation['access'] = 'unknown'
  let confidence = 45

  if (includesIdentifier(allowedList, args.identifier) || useful) {
    access = 'allowed'
    confidence += useful ? 30 : 20
    reasons.push('Cet élément est utile ou autorisé pour le contexte de travail.')
  }

  if (includesIdentifier(blockedList, args.identifier)) {
    access = 'blocked'
    confidence += 30
    reasons.push('Cet élément est dans la liste des distractions bloquées.')
  }

  if (args.sessionPlan.mode === 'allowlist' && access === 'unknown') {
    access = 'blocked'
    confidence += 25
    reasons.push('La session utilise le mode outils nécessaires, et cet élément n’est pas requis.')
  }

  if (access === 'unknown' && args.sessionPlan.mode === 'blocklist') {
    access = 'conditional'
    reasons.push('Cet élément n’est pas explicitement bloqué, mais son utilité n’est pas confirmée.')
  }

  if (args.sessionPlan.protectionLevel >= 80 && access === 'blocked') {
    reasons.push('La protection forte rend les accès non nécessaires plus stricts.')
  }

  return {
    targetKind: args.targetKind,
    identifier: args.identifier,
    access,
    reasons,
    confidence: Math.max(0, Math.min(100, Math.round(confidence))),
    relatedTaskId: args.task?.id,
    relatedObjectiveId: args.objective?.id ?? args.task?.linkedObjectiveId ?? undefined,
  }
}

export function explainAppAccess(
  app: string | RegistryItem,
  sessionPlan: SessionPlan,
  task?: Task | null,
  objective?: Objective | null,
  registryEntry?: RegistryItem,
): AppAccessExplanation {
  const inferredRegistry = typeof app === 'string' ? registryEntry : app
  return explainAccess({
    targetKind: 'app',
    identifier: targetIdentifier(app),
    sessionPlan,
    task,
    objective,
    registryEntry: inferredRegistry,
  })
}

export function explainSiteAccess(
  site: string | RegistryItem,
  sessionPlan: SessionPlan,
  task?: Task | null,
  objective?: Objective | null,
  registryEntry?: RegistryItem,
): AppAccessExplanation {
  const inferredRegistry = typeof site === 'string' ? registryEntry : site
  return explainAccess({
    targetKind: 'site',
    identifier: targetIdentifier(site),
    sessionPlan,
    task,
    objective,
    registryEntry: inferredRegistry,
  })
}
