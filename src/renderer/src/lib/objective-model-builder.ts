import type { PriorityEngineContext } from './priority-engine'
import { buildObjectivePriorityResult, buildTaskPriorityResult } from './priority-engine'
import { buildObjectiveUnderstandingResult, type CoachUnderstandingHint } from './understanding-engine'
import type {
  ObjectiveDomain, ObjectiveExplanationSummary, ObjectiveLinkedTaskSummary, ObjectiveMission,
  ObjectiveModelV2, ObjectiveNextAction, ObjectiveProgress, ObjectiveProtectionProfile,
  ObjectiveRisk, ObjectiveRiskLevel, ObjectiveStatusV2,
} from '@shared/objective-model'
import { DEFAULT_OBJECTIVE_MODEL_V2_FLAGS, OBJECTIVE_MODEL_V2_VERSION } from '@shared/objective-model'
import type { PriorityResult, UnderstandingResult } from '@shared/engine-results'
import type { OnboardingResult } from '@shared/onboarding-model'
import type { Objective, RegistryItem, Task, UnlockPolicy } from '@shared/schemas'
import type { UserAppSitePreference, UserBehaviorEvent, UserModel } from '@shared/user-model'
import { estimateMinutesForLevel } from './free-time-calculator'

export type ObjectiveModelSessionLike = {
  targetType?: 'task' | 'objective' | 'session'
  targetId?: string
  taskId?: string
  objectiveId?: string
  startedAt?: string
  endedAt?: string
  durationMinutes?: number
  status?: string
}

export type ObjectivePlanningContext = {
  usableFreeMinutes?: number
  dailyCapacityMinutes?: number
  daysAvailable?: number
  usableFreeMinutesBeforeDeadline?: number
}

export type BuildObjectiveModelV2Input = {
  objective: Objective
  linkedTasks?: Task[]
  /** Legacy alias accepted during Point 1 integration. */
  tasks?: Task[]
  sessions?: ObjectiveModelSessionLike[]
  behaviorEvents?: UserBehaviorEvent[]
  userModel?: UserModel | null
  priorityResults?: PriorityResult[] | Record<string, PriorityResult>
  understandingResults?: UnderstandingResult | null
  appSitePreferences?: UserAppSitePreference[]
  registry?: RegistryItem[]
  onboardingResult?: OnboardingResult | null
  planningContext?: ObjectivePlanningContext
  settings?: { lowRiskUnlockPolicy?: UnlockPolicy }
  now?: Date | string
  priorityContext?: PriorityEngineContext
  coachUnderstanding?: CoachUnderstandingHint
}

const clamp = (value: number): number => Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0
const unique = (values: string[]): string[] => Array.from(new Set(values.filter((value) => value.trim())))
const asDate = (value?: Date | string): Date => value instanceof Date ? value : value ? new Date(value) : new Date()
const instant = (value?: string): number => value ? new Date(value).getTime() : Number.NaN
const daysSince = (value: string | null | undefined, now: Date): number => {
  const time = instant(value ?? undefined)
  return Number.isFinite(time) ? Math.max(0, (now.getTime() - time) / 86_400_000) : Number.POSITIVE_INFINITY
}
const withinDays = (value: string | undefined, now: Date, days: number): boolean => daysSince(value, now) <= days
const dateKey = (date: Date): string => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const duration = (session: ObjectiveModelSessionLike): number => Math.max(0, session.durationMinutes ?? (
  Number.isFinite(instant(session.startedAt)) && Number.isFinite(instant(session.endedAt))
    ? Math.round((instant(session.endedAt) - instant(session.startedAt)) / 60_000) : 0
))
const taskMinutes = (task: Task): { estimated: number; remaining: number } => {
  const base = Math.max(0, task.estimatedMinutes ?? estimateMinutesForLevel(task.level))
  const remaining = task.status === 'completed' ? 0 : Math.max(0, task.remainingMinutes ?? base)
  return { estimated: Math.max(base, remaining), remaining }
}
const importance = (score: number): ObjectiveMission['declaredImportance'] => score >= 85 ? 'central' : score >= 65 ? 'important' : score >= 35 ? 'supporting' : 'unknown'
const riskLevel = (score: number): ObjectiveRiskLevel => score >= 85 ? 'critical' : score >= 65 ? 'high' : score >= 40 ? 'medium' : 'low'
const domainOf = (value: string | undefined): ObjectiveDomain => {
  if (value === 'maintenance') return 'personal'
  return ['school','work','project','discipline','health','finance','future','personal'].includes(value ?? '') ? value as ObjectiveDomain : 'unknown'
}
const priorityFor = (results: BuildObjectiveModelV2Input['priorityResults'], id: string): PriorityResult | undefined =>
  Array.isArray(results) ? results.find((result) => result.targetId === id) : results?.[id]

function sessionBelongs(session: ObjectiveModelSessionLike, objectiveId: string, taskIds: Set<string>): boolean {
  return session.objectiveId === objectiveId ||
    (session.targetType === 'objective' && session.targetId === objectiveId) ||
    Boolean(session.taskId && taskIds.has(session.taskId)) ||
    Boolean(session.targetType === 'task' && session.targetId && taskIds.has(session.targetId))
}

export function buildObjectiveMission(
  objective: Objective,
  userModel?: UserModel | null,
  onboardingResult?: OnboardingResult | null,
  understandingResult?: UnderstandingResult | null,
): ObjectiveMission {
  const preference = userModel?.objectivePreferences.find((item) => item.objectiveId === objective.id)
  const correction = [...(userModel?.corrections ?? [])].reverse().find((item) => item.targetType === 'objective' && item.targetId === objective.id && typeof item.newValue === 'number')
  const onboardingScore = onboardingResult?.firstObjective.importance === 'central' ? 100
    : onboardingResult?.firstObjective.importance === 'very_important' ? 80
      : onboardingResult?.firstObjective.importance === 'important' ? 60 : undefined
  const levelScore = clamp(20 + objective.level * 10)
  const declaredImportanceScore = clamp(Number(correction?.newValue ?? preference?.declaredImportanceScore ?? onboardingScore ?? levelScore))
  const lifeImpactScore = clamp(preference?.lifeImpactScore ?? understandingResult?.lifeImpactGuess ?? (objective.description ? levelScore : 0))
  const observedCommitmentScore = clamp(preference?.observedCommitmentScore ?? 0)
  const commitment = userModel?.disciplineCommitments.find((item) => item.type === 'objective' && item.protectedByVethos && (
    item.targetValue === objective.id || (typeof item.targetValue === 'string' && item.targetValue.toLocaleLowerCase() === objective.name.toLocaleLowerCase())
  ))
  const commitmentStrength = commitment?.strength === 'non_negotiable' || declaredImportanceScore >= 95 ? 'non_negotiable'
    : commitment?.strength === 'strong' || declaredImportanceScore >= 80 ? 'strong'
      : declaredImportanceScore >= 35 ? 'normal' : 'weak'
  const protectedByVethos = objective.status === 'active' && (declaredImportanceScore >= 60 || Boolean(commitment))
  const reasonWhy = onboardingResult?.firstObjective.whyItMatters?.trim() || objective.description?.trim() || null
  const reasons = unique([
    ...(preference?.reasons ?? []), ...(understandingResult?.reasons ?? []),
    onboardingScore !== undefined ? `Importance déclarée pendant l’onboarding : ${onboardingResult!.firstObjective.importance}.` : '',
    correction ? 'L’importance tient compte d’une correction explicite de l’utilisateur.' : '',
    commitment ? 'Cet objectif correspond à un engagement protégé du modèle utilisateur.' : '',
    `Le niveau ${objective.level} fournit le repère d’importance existant.`,
  ])
  const confidence = clamp(Math.max(preference?.confidence ?? 0, onboardingResult ? 80 : 0, understandingResult?.confidence ?? 0, objective.description ? 55 : 30))
  return {
    missionStatement: reasonWhy ?? objective.name,
    reasonWhy,
    desiredOutcome: objective.description?.trim() || null,
    failureCost: null,
    successReward: null,
    declaredImportanceScore,
    lifeImpactScore,
    commitmentStrength,
    protectedByVethos,
    confidence,
    reasons: reasons.length ? reasons : ['La mission reste à préciser avec l’utilisateur.'],
    label: objective.name,
    domain: domainOf(understandingResult?.category ?? userModel?.declaredProfile.primaryLifeArea),
    declaredImportance: importance(declaredImportanceScore),
    observedCommitmentScore,
  }
}

export function buildObjectiveProgress(
  objective: Objective,
  linkedTasks: readonly Task[] = [],
  sessions: readonly ObjectiveModelSessionLike[] = [],
  now = new Date(),
): ObjectiveProgress {
  const totals = linkedTasks.reduce((sum, task) => { const value = taskMinutes(task); return { estimated: sum.estimated + value.estimated, remaining: sum.remaining + value.remaining } }, { estimated: 0, remaining: 0 })
  const completedTaskCount = linkedTasks.filter((task) => task.status === 'completed').length
  const related = sessions.filter((session) => sessionBelongs(session, objective.id, new Set(linkedTasks.map((task) => task.id))))
  const minutes = (days?: number): number => related.filter((session) => days === undefined || withinDays(session.endedAt ?? session.startedAt, now, days)).reduce((sum, session) => sum + duration(session), 0)
  const hasReliableTime = linkedTasks.length > 0 && linkedTasks.some((task) => task.estimatedMinutes !== undefined || task.remainingMinutes !== undefined) && totals.estimated > 0
  const progressSource: ObjectiveProgress['progressSource'] = hasReliableTime ? 'time' : linkedTasks.length ? 'tasks' : 'none'
  const progressPercent = objective.status === 'completed' ? 100 : hasReliableTime
    ? clamp((1 - totals.remaining / totals.estimated) * 100)
    : linkedTasks.length ? clamp(completedTaskCount / linkedTasks.length * 100) : 0
  const investedMinutesThisWeek = minutes(7)
  const latestActivity = Math.max(0, ...related.map((session) => instant(session.endedAt ?? session.startedAt)).filter(Number.isFinite), ...linkedTasks.map((task) => instant(task.completedAt)).filter(Number.isFinite))
  const inactiveDays = latestActivity ? (now.getTime() - latestActivity) / 86_400_000 : daysSince(objective.createdAt, now)
  return {
    progressPercent,
    completedTaskCount,
    totalTaskCount: linkedTasks.length,
    activeTaskCount: linkedTasks.filter((task) => task.status === 'active').length,
    queuedTaskCount: linkedTasks.filter((task) => task.status === 'queued').length,
    expiredTaskCount: linkedTasks.filter((task) => task.status === 'expired').length,
    estimatedTotalMinutes: totals.estimated,
    remainingTotalMinutes: totals.remaining,
    investedMinutesToday: related.filter((session) => (session.endedAt ?? session.startedAt)?.startsWith(dateKey(now))).reduce((sum, session) => sum + duration(session), 0),
    investedMinutesThisWeek,
    investedMinutesTotal: minutes(),
    progressSource,
    confidence: progressSource === 'time' ? 90 : progressSource === 'tasks' ? 65 : 25,
    momentumScore: clamp(investedMinutesThisWeek ? 45 + Math.min(45, investedMinutesThisWeek / 4) : 10),
    stagnationScore: objective.status === 'active' ? clamp(inactiveDays >= 14 ? 100 : inactiveDays >= 7 ? 75 : inactiveDays * 7) : 0,
    linkedTaskCount: linkedTasks.length,
    remainingMinutes: totals.remaining,
  }
}

export function buildObjectiveRisk(
  objective: Objective,
  linkedTasks: readonly Task[],
  sessions: readonly ObjectiveModelSessionLike[],
  events: readonly UserBehaviorEvent[],
  userModel?: UserModel | null,
  planningContext?: ObjectivePlanningContext,
  now = new Date(),
  progress = buildObjectiveProgress(objective, linkedTasks, sessions, now),
  mission = buildObjectiveMission(objective, userModel),
): ObjectiveRisk {
  const today = Date.parse(`${dateKey(now)}T00:00:00`)
  const open = linkedTasks.filter((task) => task.status !== 'completed')
  const deadlineRiskScore = open.reduce((score, task) => {
    const days = (Date.parse(`${task.deadline}T00:00:00`) - today) / 86_400_000
    const timePressure = planningContext?.usableFreeMinutesBeforeDeadline !== undefined && progress.remainingTotalMinutes > 0
      ? clamp(progress.remainingTotalMinutes / Math.max(1, planningContext.usableFreeMinutesBeforeDeadline) * 70) : 0
    return Math.max(score, task.status === 'expired' || days < 0 ? 100 : days <= 1 ? (task.deadlineImpact === 'hard' ? 95 : 80) : days <= 3 ? 65 : 0, timePressure)
  }, 0)
  const relatedEvents = events.filter((event) => (event.targetType === 'objective' && event.targetId === objective.id) || event.context?.objectiveId === objective.id)
  const avoidKinds = new Set(['task_skipped','session_aborted','recommendation_rejected','unlock_requested','task_expired'])
  const avoidanceScore = clamp(relatedEvents.filter((event) => withinDays(event.createdAt, now, 14) && avoidKinds.has(event.type)).length * 18 + progress.expiredTaskCount * 15)
  const capacity = planningContext?.dailyCapacityMinutes
  const daysAvailable = Math.max(1, planningContext?.daysAvailable ?? 7)
  const overloadRiskScore = clamp(Math.max(progress.remainingTotalMinutes / 8, progress.activeTaskCount >= 8 ? 90 : progress.activeTaskCount * 10, capacity !== undefined && progress.remainingTotalMinutes > capacity * daysAvailable ? 85 : 0))
  const noNextActionRisk = objective.status === 'active' && progress.activeTaskCount === 0 && progress.queuedTaskCount === 0 ? 100 : 0
  const stagnationScore = clamp(Math.max(progress.stagnationScore, userModel?.objectivePreferences.find((item) => item.objectiveId === objective.id)?.stagnationScore ?? 0))
  const important = mission.declaredImportanceScore >= 60
  const overallRiskScore = clamp(Math.max(deadlineRiskScore, avoidanceScore, overloadRiskScore, stagnationScore, important ? noNextActionRisk : noNextActionRisk * .65))
  const reasons = unique([
    noNextActionRisk >= 80 ? 'Cet objectif actif n’a aucune tâche active ou en attente.' : '',
    stagnationScore >= 60 ? 'Aucune progression ou session récente ne soutient suffisamment cet objectif.' : '',
    progress.expiredTaskCount ? `${progress.expiredTaskCount} tâche(s) liée(s) ont expiré.` : '',
    overloadRiskScore >= 65 ? `${progress.remainingTotalMinutes} minutes de travail restent à répartir.` : '',
    deadlineRiskScore >= 65 ? 'Une deadline liée approche au regard du travail restant.' : '',
    avoidanceScore >= 45 ? 'Des reports, abandons ou demandes de déverrouillage récents signalent un évitement contextuel.' : '',
    planningContext?.usableFreeMinutes === 0 ? 'Aucun créneau libre utilisable n’est disponible.' : '',
    important && !objective.blocking?.enabled ? 'Cet objectif est important mais ne possède pas encore de protection active.' : '',
  ])
  return {
    riskLevel: riskLevel(overallRiskScore), stagnationScore, avoidanceScore, deadlineRiskScore,
    overloadRiskScore, noNextActionRisk, reasons: reasons.length ? reasons : ['Aucun signal de risque significatif n’est détecté.'],
    warnings: reasons.filter((reason) => overallRiskScore >= 65 && reason !== 'Aucun signal de risque significatif n’est détecté.'),
    updatedAt: now.toISOString(), overallRiskScore, stagnationRiskScore: stagnationScore,
    avoidanceRiskScore: avoidanceScore, noNextActionRiskScore: noNextActionRisk,
  }
}

function linkedTaskSummaries(objective: Objective, tasks: readonly Task[], context: PriorityEngineContext, supplied?: BuildObjectiveModelV2Input['priorityResults']): ObjectiveLinkedTaskSummary[] {
  return tasks.map((task) => {
    const score = priorityFor(supplied, task.id)?.priorityScore ?? buildTaskPriorityResult(task, objective, context).priorityScore
    return { taskId: task.id, id: task.id, title: task.title, status: task.status, priorityScore: score, remainingMinutes: taskMinutes(task).remaining, deadline: task.deadline, isActive: task.status === 'active', isNextRecommended: false }
  }).sort((a, b) => b.priorityScore - a.priorityScore || a.deadline.localeCompare(b.deadline) || a.remainingMinutes - b.remainingMinutes)
}

export function buildObjectiveNextAction(
  objective: Objective,
  linkedTasks: readonly ObjectiveLinkedTaskSummary[],
  _priorityResults?: BuildObjectiveModelV2Input['priorityResults'],
  risk?: ObjectiveRisk,
  userModel?: UserModel | null,
): ObjectiveNextAction {
  const active = linkedTasks.find((task) => task.status === 'active')
  const queued = linkedTasks.find((task) => task.status === 'queued')
  const fatigue = (userModel?.cognitiveModel.fatigueRiskByHour ?? []).some((item) => item.risk >= 80)
  let kind: ObjectiveNextAction['kind']; let task: ObjectiveLinkedTaskSummary | undefined; let reason: string; let label: string; let minutes = 25
  if (objective.status === 'completed') { kind = 'review_objective'; reason = 'L’objectif est terminé; aucune tâche ne doit être activée automatiquement.'; label = 'Relire l’objectif'; minutes = 10 }
  else if (fatigue && (risk?.overloadRiskScore ?? 0) >= 65) { kind = 'rest'; reason = 'La fatigue et la surcharge rendent une récupération préférable avant une nouvelle session.'; label = 'Récupérer avant de reprendre'; minutes = 15 }
  else if ((risk?.stagnationScore ?? 0) >= 65 && (active || queued)) { kind = 'recover_stagnation'; task = active ?? queued; reason = 'Une courte reprise réduit le coût de redémarrage de cet objectif stagnant.'; label = `Reprendre : ${task!.title}`; minutes = task!.remainingMinutes >= 90 ? 45 : 25 }
  else if (active) { kind = 'continue_task'; task = active; reason = 'Une tâche active existe déjà et conserve la continuité du travail.'; label = `Continuer : ${active.title}`; minutes = Math.min(90, Math.max(25, active.remainingMinutes)) }
  else if (queued) { kind = 'start_task'; task = queued; reason = 'C’est la tâche en attente la mieux classée selon sa priorité, sa deadline et son travail restant.'; label = `Démarrer : ${queued.title}`; minutes = Math.min(75, Math.max(25, queued.remainingMinutes)) }
  else { kind = 'create_task'; reason = "Cet objectif n'a pas encore de prochaine action."; label = 'Créer une prochaine action concrète'; minutes = 15 }
  return {
    activeTaskId: active?.taskId ?? null,
    nextRecommendedTaskId: task?.taskId ?? null,
    suggestedActionType: kind,
    suggestedDurationMinutes: minutes,
    reason,
    confidence: task ? 85 : kind === 'create_task' ? 95 : 65,
    kind,
    ...(task ? { taskId: task.taskId } : {}),
    label,
    recommendedSessionMinutes: minutes,
    reasons: [reason],
  }
}

const unlockPolicyFor = (level: number, fallback?: UnlockPolicy): UnlockPolicy => level >= 85 ? { type:'cooldown_and_justification', minutes:10, minWords:120 } : level >= 65 ? { type:'justification', minWords:60 } : level >= 35 ? { type:'cooldown', minutes:5 } : fallback ?? { type:'none' }

export function buildObjectiveProtectionProfile(
  objective: Objective,
  linkedTasks: readonly Task[],
  appSitePreferences: readonly UserAppSitePreference[] = [],
  userModel?: UserModel | null,
  settings?: { lowRiskUnlockPolicy?: UnlockPolicy },
  mission = buildObjectiveMission(objective, userModel),
  risk?: ObjectiveRisk,
  registry: readonly RegistryItem[] = [],
): ObjectiveProtectionProfile {
  const taskIds = new Set(linkedTasks.map((task) => task.id))
  const matching = appSitePreferences.flatMap((preference) => preference.contextRules.filter((rule) =>
    (rule.contextType === 'objective' && rule.contextId === objective.id) || (rule.contextType === 'task' && Boolean(rule.contextId && taskIds.has(rule.contextId))) || (rule.contextType === 'domain' && rule.domain === mission.domain)
  ).map((rule) => ({ preference, classification: rule.classification })))
  const registryUseful = registry.filter((item) => item.usefulFor.objectives.includes(objective.id) || item.usefulFor.standaloneTasks.some((id) => taskIds.has(id)))
  const fromBlocking = (mode: 'allowlist'|'blocklist', field: 'processes'|'networkApps'|'sites'): string[] => [objective.blocking, ...linkedTasks.map((task) => task.blocking)].filter((value) => value?.mode === mode).flatMap((value) => value?.[field] ?? [])
  const pick = (kind: 'app'|'site', classification: 'useful'|'distraction'): string[] => matching.filter((item) => item.preference.kind === kind && item.classification === classification).map((item) => item.preference.identifier)
  const usefulApps = unique([...pick('app','useful'), ...registryUseful.filter((item) => item.kind === 'app').map((item) => item.executableName ?? item.identifier), ...fromBlocking('allowlist','processes'), ...fromBlocking('allowlist','networkApps')])
  const usefulSites = unique([...pick('site','useful'), ...registryUseful.filter((item) => item.kind === 'site').map((item) => item.identifier), ...fromBlocking('allowlist','sites')])
  const distractingApps = unique([...pick('app','distraction'), ...fromBlocking('blocklist','processes'), ...fromBlocking('blocklist','networkApps')])
  const distractingSites = unique([...pick('site','distraction'), ...fromBlocking('blocklist','sites')])
  let base = Math.max(25 + (objective.level - 3) * 10, mission.declaredImportanceScore * .7)
  if (mission.commitmentStrength === 'non_negotiable') base = Math.max(base, 85)
  if (userModel?.declaredProfile.protectionStyle === 'strict') base += 10
  if (userModel?.declaredProfile.protectionStyle === 'calm') base -= 8
  base = Math.max(base, userModel?.disciplineModel.globalDistractionRisk ?? 0)
  const defaultProtectionLevel = clamp(base)
  const recommendedProtectionLevel = clamp(Math.max(defaultProtectionLevel, risk?.deadlineRiskScore ?? 0, risk?.avoidanceScore ?? 0, risk?.overallRiskScore ?? 0))
  const defaultMode = objective.blocking?.mode ?? (mission.commitmentStrength === 'non_negotiable' || recommendedProtectionLevel >= 70 ? 'allowlist' : 'blocklist')
  const reasons = unique([
    `Le niveau par défaut reflète l’importance déclarée et le niveau ${objective.level}.`,
    recommendedProtectionLevel > defaultProtectionLevel ? 'Le risque actuel justifie une protection recommandée supérieure au niveau habituel.' : '',
    defaultMode === 'allowlist' ? 'Une liste d’outils autorisés protège mieux cet engagement fort.' : 'Une liste de distractions suffit pour ce contexte.',
    usefulApps.length || usefulSites.length ? 'Les outils utiles déclarés pour l’objectif ou ses tâches sont préservés.' : '',
  ])
  return {
    defaultProtectionLevel, recommendedProtectionLevel, defaultMode,
    unlockPolicy: objective.unlockPolicy ?? objective.blocking?.unlockPolicy ?? unlockPolicyFor(recommendedProtectionLevel, settings?.lowRiskUnlockPolicy),
    protectedApps: usefulApps, protectedSites: usefulSites, usefulApps, usefulSites, distractingApps, distractingSites,
    reasons, confidence: clamp(45 + matching.length * 8 + registryUseful.length * 5), mode: defaultMode,
  }
}

export function buildObjectiveLifecycleStatus(objective: Objective, progress: ObjectiveProgress, risk: ObjectiveRisk, nextAction: ObjectiveNextAction, sessions: readonly ObjectiveModelSessionLike[] = []): ObjectiveStatusV2 {
  const rawStatus: string = objective.status
  const lastSessionAt = sessions.map((session) => session.endedAt ?? session.startedAt).filter(Boolean).sort().at(-1) ?? null
  const state = rawStatus === 'archived' ? 'archived' : rawStatus === 'paused' ? 'paused'
    : rawStatus === 'completed' || (progress.totalTaskCount > 0 && progress.completedTaskCount === progress.totalTaskCount && progress.progressPercent === 100) ? 'completed'
      : risk.stagnationScore >= 65 && progress.momentumScore < 40 ? 'stalled'
        : Math.max(risk.deadlineRiskScore, risk.noNextActionRisk, risk.avoidanceScore, risk.overloadRiskScore) >= 65 ? 'at_risk' : 'active'
  const reasons = state === 'completed' ? ['L’objectif est terminé ou toutes ses tâches sont complétées.']
    : state === 'stalled' ? ['L’objectif est actif, stagne et ne montre pas d’activité récente suffisante.']
      : state === 'at_risk' ? risk.reasons : [`L’objectif est ${state}.`]
  return {
    state, isCurrentlyProtected: Boolean(objective.blocking?.enabled),
    lastWorkedAt: lastSessionAt, lastCompletedTaskAt: null, lastSessionAt, reasons,
    currentSchemaStatus: objective.status, isActive: ['active','at_risk','stalled'].includes(state), isCompleted: state === 'completed',
  }
}

export function explainObjective(model: Omit<ObjectiveModelV2, 'explanation'> | ObjectiveModelV2): ObjectiveExplanationSummary {
  const days = model.status.lastSessionAt ? Math.floor(daysSince(model.status.lastSessionAt, new Date(model.metadata.updatedAt))) : null
  const reasons = unique([
    model.nextAction.reason,
    model.mission.declaredImportanceScore >= 80 ? `Cet objectif est prioritaire parce que son importance déclarée est forte et ${model.progress.totalTaskCount} tâche(s) y sont liées.` : '',
    model.risk.stagnationScore >= 65 ? `Cet objectif stagne${days !== null ? ` : aucune session liée depuis ${days} jours` : ' faute d’activité récente'}.` : '',
    model.risk.deadlineRiskScore >= 65 ? `Il reste ${(model.progress.remainingTotalMinutes / 60).toFixed(1)} h de travail estimé et la deadline la plus proche approche.` : '',
    model.risk.noNextActionRisk >= 80 ? "Cet objectif n'a pas de tâche active. Vethos ne peut pas le protéger correctement tant qu'aucune action concrète n'existe." : '',
    model.progress.investedMinutesThisWeek > 0 ? 'Tu as travaillé dessus cette semaine. Continuer maintenant coûte moins d’énergie que reprendre plus tard.' : '',
    ...model.risk.reasons,
  ])
  return {
    title: model.identity.title,
    summary: `${model.mission.missionStatement} Prochaine action : ${model.nextAction.label}`,
    reasons,
    warnings: model.risk.warnings,
    confidence: clamp(Math.min(model.mission.confidence, model.progress.confidence, model.nextAction.confidence)),
  }
}

export function buildObjectiveModelV2(input: BuildObjectiveModelV2Input): ObjectiveModelV2 {
  const now = asDate(input.now)
  const linkedTasks = input.linkedTasks ?? input.tasks ?? []
  const sessions = input.sessions ?? []
  const context: PriorityEngineContext = { ...input.priorityContext, now, recentlyWorkedTargetIds: sessions.filter((session) => withinDays(session.endedAt ?? session.startedAt, now, 7)).flatMap((session) => [session.targetId,session.taskId,session.objectiveId].filter(Boolean) as string[]), recentlyCompletedTaskIds: linkedTasks.filter((task) => withinDays(task.completedAt, now, 7)).map((task) => task.id) }
  const understanding = input.understandingResults ?? buildObjectiveUnderstandingResult(
    input.objective,
    linkedTasks,
    input.registry,
    input.coachUnderstanding,
    { sessions, corrections: input.userModel?.corrections },
  )
  const mission = buildObjectiveMission(input.objective, input.userModel, input.onboardingResult, understanding)
  const progress = buildObjectiveProgress(input.objective, linkedTasks, sessions, now)
  const risk = buildObjectiveRisk(input.objective, linkedTasks, sessions, input.behaviorEvents ?? input.userModel?.behaviorEvents ?? [], input.userModel, input.planningContext, now, progress, mission)
  const summaries = linkedTaskSummaries(input.objective, linkedTasks, context, input.priorityResults)
  const nextAction = buildObjectiveNextAction(input.objective, summaries, input.priorityResults, risk, input.userModel)
  const nextSummaries = summaries.map((task) => ({ ...task, isNextRecommended: task.taskId === nextAction.nextRecommendedTaskId }))
  const protection = buildObjectiveProtectionProfile(input.objective, linkedTasks, input.appSitePreferences ?? input.userModel?.appSitePreferences ?? [], input.userModel, input.settings, mission, risk, input.registry)
  const relatedSessions = sessions.filter((session) => sessionBelongs(session, input.objective.id, new Set(linkedTasks.map((task) => task.id))))
  const status = buildObjectiveLifecycleStatus(input.objective, progress, risk, nextAction, relatedSessions)
  const lastCompletedTaskAt = linkedTasks.map((task) => task.completedAt).filter(Boolean).sort().at(-1) ?? null
  status.lastCompletedTaskAt = lastCompletedTaskAt
  status.lastWorkedAt = [status.lastSessionAt, lastCompletedTaskAt].filter(Boolean).sort().at(-1) ?? null
  const source = input.onboardingResult ? 'onboarding' : input.userModel ? 'user_model' : input.coachUnderstanding ? 'coach' : 'objective_model_builder'
  const base = {
    identity: { objectiveId: input.objective.id, id: input.objective.id, title: input.objective.name, name: input.objective.name, description: input.objective.description, color: input.objective.color, icon: input.objective.icon, domain: mission.domain, createdAt: input.objective.createdAt, updatedAt: input.objective.lastLevelChangeAt ?? input.objective.createdAt },
    mission, status, progress, risk, protection, nextAction, linkedTasks: nextSummaries,
    metadata: { modelVersion: OBJECTIVE_MODEL_V2_VERSION, version: OBJECTIVE_MODEL_V2_VERSION, createdAt: input.objective.createdAt, updatedAt: now.toISOString(), generatedAt: now.toISOString(), source, flags: { ...DEFAULT_OBJECTIVE_MODEL_V2_FLAGS }, debug: { priorityScore: priorityFor(input.priorityResults, input.objective.id)?.priorityScore ?? buildObjectivePriorityResult(input.objective, linkedTasks, context).priorityScore, understandingConfidence: understanding.confidence } },
  } satisfies Omit<ObjectiveModelV2, 'explanation'>
  return { ...base, explanation: explainObjective(base) }
}
