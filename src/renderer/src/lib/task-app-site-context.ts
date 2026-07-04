import type { UnderstandingCategory } from '@shared/engine-results'
import type { Objective, RegistryItem, Task } from '@shared/schemas'
import type { UserAppSitePreference } from '@shared/user-model'
import type { TaskAppSiteContext } from '@shared/task-model'
import { unique } from './task-model-utils'

function matchingPreferenceRules(
  preferences: UserAppSitePreference[] | undefined,
  args: { taskId: string; objectiveId?: string | null; domain: UnderstandingCategory },
): Array<{ preference: UserAppSitePreference; classification: 'useful' | 'neutral' | 'distraction' | 'conditional' }> {
  return (preferences ?? []).flatMap((preference) => {
    return preference.contextRules
      .filter((rule) => {
        if (rule.contextType === 'task') return rule.contextId === args.taskId
        if (rule.contextType === 'objective') return Boolean(args.objectiveId && rule.contextId === args.objectiveId)
        if (rule.contextType === 'domain') return rule.domain === args.domain
        return false
      })
      .map((rule) => ({ preference, classification: rule.classification }))
  })
}

function splitPreferences(
  preferences: ReturnType<typeof matchingPreferenceRules>,
  classification: 'useful' | 'distraction' | 'conditional',
): { apps: string[]; sites: string[] } {
  const filtered = preferences.filter((entry) => entry.classification === classification)
  return {
    apps: unique(filtered.filter((entry) => entry.preference.kind === 'app').map((entry) => entry.preference.identifier)),
    sites: unique(filtered.filter((entry) => entry.preference.kind === 'site').map((entry) => entry.preference.identifier)),
  }
}

export type BuildTaskAppSiteContextInput = {
  task: Task
  objective?: Objective | null
  domain: UnderstandingCategory
  understandingUsefulApps: string[]
  understandingUsefulSites: string[]
  preferences: UserAppSitePreference[] | undefined
  registry: RegistryItem[] | undefined
}

export function buildTaskAppSiteContext(args: BuildTaskAppSiteContextInput): TaskAppSiteContext {
  const rules = matchingPreferenceRules(args.preferences, {
    taskId: args.task.id,
    objectiveId: args.task.linkedObjectiveId,
    domain: args.domain,
  })
  const useful = splitPreferences(rules, 'useful')
  const conditional = splitPreferences(rules, 'conditional')
  const distracting = splitPreferences(rules, 'distraction')
  const blocking = args.task.blocking ?? args.objective?.blocking
  const registryUseful = (args.registry ?? []).filter((item) => {
    return (
      item.usefulFor.standaloneTasks.includes(args.task.id) ||
      Boolean(args.task.linkedObjectiveId && item.usefulFor.objectives.includes(args.task.linkedObjectiveId))
    )
  })
  const usefulApps = unique([
    ...args.understandingUsefulApps,
    ...useful.apps,
    ...conditional.apps,
    ...registryUseful.filter((item) => item.kind === 'app').map((item) => item.executableName ?? item.identifier),
    ...(blocking?.mode === 'allowlist' ? [...blocking.processes, ...blocking.networkApps] : []),
  ])
  const usefulSites = unique([
    ...args.understandingUsefulSites,
    ...useful.sites,
    ...conditional.sites,
    ...registryUseful.filter((item) => item.kind === 'site').map((item) => item.identifier),
    ...(blocking?.mode === 'allowlist' ? blocking.sites : []),
  ])
  const distractingApps = unique([
    ...distracting.apps,
    ...(blocking?.mode === 'blocklist' ? [...blocking.processes, ...blocking.networkApps] : []),
  ])
  const distractingSites = unique([
    ...distracting.sites,
    ...(blocking?.mode === 'blocklist' ? blocking.sites : []),
  ])
  const classified = new Set([...usefulApps, ...usefulSites, ...distractingApps, ...distractingSites])
  const unknown = (args.registry ?? []).filter((item) => !item.classified && !classified.has(item.identifier))
  const reasons: string[] = []
  
  if (usefulApps.length > 0 || usefulSites.length > 0) reasons.push('Des outils utiles sont connus pour cette tâche.')
  if (distractingApps.length > 0 || distractingSites.length > 0) reasons.push('Des distractions sont connues pour cette tâche.')
  if (unknown.length > 0) reasons.push('Certaines apps/sites restent inconnus et doivent rester en observation.')
  if (reasons.length === 0) reasons.push('Aucun contexte app/site fort détecté.')

  return {
    usefulApps,
    usefulSites,
    distractingApps,
    distractingSites,
    unknownApps: unique(unknown.filter((item) => item.kind === 'app').map((item) => item.executableName ?? item.identifier)),
    unknownSites: unique(unknown.filter((item) => item.kind === 'site').map((item) => item.identifier)),
    reasons,
  }
}
