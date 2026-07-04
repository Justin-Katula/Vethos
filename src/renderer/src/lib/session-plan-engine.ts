import type { SessionPlan } from '@shared/engine-results'
import type { Objective, RegistryItem, Settings, Task, UnlockPolicy, WorkBlockingConfig } from '@shared/schemas'
import type { PlacedBlock } from './placement-engine'
import { buildTaskPriorityResult } from './priority-engine'
import type { UserModel } from '@shared/user-model'

export type ManualSessionTarget = {
  targetType: 'task' | 'objective' | 'session'
  targetId?: string
  level?: number
  complexity?: Task['complexity']
  blocking?: WorkBlockingConfig
  unlockPolicy?: UnlockPolicy
}

const DEFAULT_UNLOCK_POLICY: UnlockPolicy = { type: 'cooldown', minutes: 5 }

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

function splitUsefulRegistry(registry: RegistryItem[] | undefined, task?: Task | null, objective?: Objective | null) {
  const taskId = task?.id
  const objectiveId = objective?.id ?? task?.linkedObjectiveId ?? undefined
  const useful = (registry ?? []).filter((item) => {
    return (
      (taskId ? item.usefulFor.standaloneTasks.includes(taskId) : false) ||
      (objectiveId ? item.usefulFor.objectives.includes(objectiveId) : false)
    )
  })
  return {
    apps: unique(
      useful
        .filter((item) => item.kind === 'app')
        .map((item) => item.executableName ?? item.identifier),
    ),
    sites: unique(useful.filter((item) => item.kind === 'site').map((item) => item.identifier)),
  }
}

function usefulFromAllowlist(blocking?: WorkBlockingConfig) {
  if (!blocking?.enabled || blocking.mode !== 'allowlist') return { apps: [], sites: [] }
  return {
    apps: unique([...blocking.processes, ...blocking.networkApps]),
    sites: unique(blocking.sites),
  }
}

function blockedFromBlocklist(blocking?: WorkBlockingConfig) {
  if (!blocking?.enabled || blocking.mode !== 'blocklist') return { apps: [], sites: [] }
  return {
    apps: unique([...blocking.processes, ...blocking.networkApps]),
    sites: unique(blocking.sites),
  }
}

function unlockPolicyForProtection(protectionLevel: number, settings?: Settings): UnlockPolicy {
  const cooldown = settings?.defaultUnlockCooldownMinutes ?? 5
  const words = settings?.defaultUnlockJustificationWords ?? 80
  if (protectionLevel >= 80) {
    return { type: 'cooldown_and_justification', minutes: cooldown, minWords: words }
  }
  if (protectionLevel >= 50) return { type: 'justification', minWords: words }
  return { type: 'cooldown', minutes: cooldown }
}

function protectionForTarget(args: {
  task?: Task | null
  objective?: Objective | null
  settings?: Settings
  durationMinutes: number
}): number {
  let protection = 40
  if (args.objective) protection += Math.max(0, args.objective.level - 3) * 8
  if (args.task) {
    const priority = buildTaskPriorityResult(args.task, args.objective)
    protection = Math.max(
      protection,
      Math.round(priority.complexityScore * 0.45 + priority.urgencyScore * 0.25 + priority.valueScore * 0.3),
    )
  }
  if (args.settings?.strictBlocking) protection += 10
  if (args.durationMinutes >= 90) protection += 5
  return clampScore(protection)
}

function planFromPieces(args: {
  targetType: SessionPlan['targetType']
  targetId?: string
  durationMinutes: number
  task?: Task | null
  objective?: Objective | null
  registry?: RegistryItem[]
  settings?: Settings
  explicitBlocking?: WorkBlockingConfig
  explicitUnlockPolicy?: UnlockPolicy
  userModel?: UserModel | null
}): SessionPlan {
  const blocking = args.explicitBlocking ?? args.task?.blocking ?? args.objective?.blocking
  const usefulRegistry = splitUsefulRegistry(args.registry, args.task, args.objective)
  const usefulAllowlist = usefulFromAllowlist(blocking)
  const blockedBlocklist = blockedFromBlocklist(blocking)
  let protectionLevel = protectionForTarget({
    task: args.task,
    objective: args.objective,
    settings: args.settings,
    durationMinutes: args.durationMinutes,
  })
  protectionLevel = Math.max(protectionLevel, args.userModel?.disciplineModel.globalDistractionRisk ?? 0)
  const contextualPreferences = args.userModel?.appSitePreferences.flatMap((preference) => preference.contextRules
    .filter((rule) => (rule.contextType === 'task' && rule.contextId === args.task?.id) || (rule.contextType === 'objective' && rule.contextId === args.objective?.id))
    .map((rule) => ({ preference, rule }))) ?? []
  const preferenceUsefulApps = contextualPreferences.filter(({ preference, rule }) => preference.kind === 'app' && rule.classification === 'useful').map(({ preference }) => preference.identifier)
  const preferenceUsefulSites = contextualPreferences.filter(({ preference, rule }) => preference.kind === 'site' && rule.classification === 'useful').map(({ preference }) => preference.identifier)
  const riskyApps = args.userModel?.disciplineModel.riskyApps.filter((item) => item.riskScore >= 60).map((item) => item.identifier) ?? []
  const riskySites = args.userModel?.disciplineModel.riskySites.filter((item) => item.riskScore >= 60).map((item) => item.domain) ?? []
  const requestedMode: 'blocklist' | 'allowlist' =
    blocking?.mode ?? (protectionLevel >= 70 || args.task?.complexity === 'extreme' ? 'allowlist' : 'blocklist')
  const allowedApps = unique([...usefulRegistry.apps, ...usefulAllowlist.apps, ...preferenceUsefulApps])
  const allowedSites = unique([...usefulRegistry.sites, ...usefulAllowlist.sites, ...preferenceUsefulSites])
  const allowlistHasUsefulResource = allowedApps.length > 0 || allowedSites.length > 0
  const mode: 'blocklist' | 'allowlist' =
    requestedMode === 'allowlist' && !allowlistHasUsefulResource ? 'blocklist' : requestedMode
  const blockedApps = mode === 'blocklist' ? unique([...blockedBlocklist.apps, ...riskyApps.filter((item) => !allowedApps.includes(item))]) : []
  const blockedSites = mode === 'blocklist' ? unique([...blockedBlocklist.sites, ...riskySites.filter((item) => !allowedSites.includes(item))]) : []
  const controlsRealBlocking = args.settings?.engineV2Blocking === true
  const reasons: string[] = controlsRealBlocking
    ? ['SessionPlan actif : il contrôle le blocage avec fallback V1 en cas d’erreur.']
    : ['SessionPlan calculé sans contrôler le blocage réel.']

  if (mode === 'allowlist') reasons.push('Mode outils nécessaires : seules les ressources utiles sont préparées.')
  if (mode === 'blocklist') reasons.push('Mode blocage ciblé : les distractions connues restent bloquées.')
  if (requestedMode === 'allowlist' && mode === 'blocklist') {
    reasons.push('Allowlist refusée : aucun outil utile connu. Repli sûr vers le blocage ciblé.')
  }
  if (protectionLevel >= 80) reasons.push('Protection forte recommandée.')
  if (allowedApps.length > 0 || allowedSites.length > 0) reasons.push('Des outils utiles sont connus pour ce contexte.')
  if (args.task && args.objective) reasons.push('La tâche active de cet objectif précise les outils nécessaires à cette session.')
  if ((args.userModel?.disciplineModel.globalDistractionRisk ?? 0) >= 60) reasons.push('L’historique réel de distraction renforce la protection de cette session.')

  return {
    targetType: args.targetType,
    targetId: args.targetId,
    durationMinutes: args.durationMinutes,
    protectionLevel,
    mode,
    allowedApps,
    allowedSites,
    blockedApps,
    blockedSites,
    unlockPolicy:
      args.explicitUnlockPolicy ??
      args.task?.unlockPolicy ??
      args.objective?.unlockPolicy ??
      blocking?.unlockPolicy ??
      unlockPolicyForProtection(protectionLevel, args.settings) ??
      DEFAULT_UNLOCK_POLICY,
    reasons,
    confidence: clampScore(55 + (args.task ? 15 : 0) + (args.objective ? 15 : 0) + (blocking ? 10 : 0)),
    debug: {
      controlsRealBlocking,
      currentResolverStillControlsBlocking: !controlsRealBlocking,
      sourceBlockingMode: blocking?.mode ?? null,
      requestedMode,
      allowlistFallbackApplied: requestedMode === 'allowlist' && mode === 'blocklist',
    },
  }
}

export function buildSessionPlanFromBlock(
  block: PlacedBlock,
  task?: Task | null,
  objective?: Objective | null,
  registry?: RegistryItem[],
  settings?: Settings,
  context?: { activeTask?: Task | null; userModel?: UserModel | null },
): SessionPlan {
  const durationMinutes = Math.max(1, block.endMinute - block.startMinute)
  const targetType = task ? 'task' : objective ? 'objective' : 'session'
  const effectiveTask = task ?? context?.activeTask ?? null
  return planFromPieces({
    targetType,
    targetId: task?.id ?? objective?.id ?? block.refId ?? undefined,
    durationMinutes,
    task: effectiveTask,
    objective,
    registry,
    settings,
    userModel: context?.userModel,
  })
}

export function buildManualSessionPlan(
  target: ManualSessionTarget,
  durationMinutes: number,
  registry?: RegistryItem[],
  settings?: Settings,
): SessionPlan {
  return planFromPieces({
    targetType: target.targetType,
    targetId: target.targetId,
    durationMinutes: Math.max(1, durationMinutes),
    registry,
    settings,
    explicitBlocking: target.blocking,
    explicitUnlockPolicy: target.unlockPolicy,
  })
}
