import type { UserBehaviorEvent, UserCorrection, UserObjectivePreference } from '@shared/user-model'

export type ObjectivePreferenceSource = {
  id: string
  level?: number
  importance?: string | number
  status?: string
  lifeArea?: string
  domain?: string
  createdAt?: string
  updatedAt?: string
}

type LinkedTask = { linkedObjectiveId?: string | null; status?: string; completedAt?: string; createdAt?: string }
type LinkedSession = { objectiveId?: string; status?: string; startedAt?: string; endedAt?: string; durationMinutes?: number; actualMinutes?: number }
export type ObjectivePreferenceContext = { now?: string; primaryLifeArea?: string }

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)))
const days = (from: string | undefined, now: number) => from ? Math.max(0, (now - Date.parse(from)) / 86_400_000) : Infinity

function declaredScore(objective: ObjectivePreferenceSource): number {
  if (typeof objective.importance === 'number') return clamp(objective.importance)
  const named: Record<string, number> = { low: 25, normal: 50, important: 65, very_important: 85, central: 100 }
  if (objective.importance && named[objective.importance] !== undefined) return named[objective.importance]!
  const level = Math.max(0, Math.min(10, objective.level ?? 5))
  return clamp(level >= 10 ? 100 : level >= 7 ? 85 : level >= 5 ? 65 : level >= 3 ? 40 : level * 12)
}

export function buildObjectivePreferenceModel(
  objective: ObjectivePreferenceSource,
  tasks: readonly LinkedTask[] = [],
  sessions: readonly LinkedSession[] = [],
  events: readonly UserBehaviorEvent[] = [],
  corrections: readonly UserCorrection[] = [],
  context: ObjectivePreferenceContext = {},
): UserObjectivePreference {
  const nowIso = context.now ?? new Date().toISOString()
  const now = Date.parse(nowIso)
  const linkedTasks = tasks.filter((task) => task.linkedObjectiveId === objective.id)
  const linkedSessions = sessions.filter((session) => session.objectiveId === objective.id)
  const linkedEvents = events.filter((event) => event.context?.objectiveId === objective.id || (event.targetType === 'objective' && event.targetId === objective.id))
  const objectiveCorrections = corrections.filter((correction) => correction.type === 'objective_importance_corrected' && correction.targetId === objective.id)
  const latestStrong = [...objectiveCorrections].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1)
  let declaredImportanceScore = declaredScore(objective)
  if (latestStrong && typeof latestStrong.newValue === 'number') declaredImportanceScore = clamp(latestStrong.newValue)

  const completedTasks = linkedTasks.filter((task) => task.status === 'completed')
  const completedSessions = linkedSessions.filter((session) => session.status === 'completed' || session.endedAt)
  const recentCompletedTasks = completedTasks.filter((task) => days(task.completedAt, now) <= 7)
  const recentSessions = completedSessions.filter((session) => days(session.endedAt ?? session.startedAt, now) <= 7)
  const aborted = linkedEvents.filter((event) => event.type === 'session_aborted').length
  const skipped = linkedEvents.filter((event) => event.type === 'task_skipped' || event.type === 'task_expired').length
  const rejected = linkedEvents.filter((event) => event.type === 'recommendation_rejected').length
  const selected = linkedEvents.filter((event) => event.type === 'objective_selected').length
  const activityDates = [
    ...completedTasks.map((task) => task.completedAt),
    ...completedSessions.map((session) => session.endedAt ?? session.startedAt),
  ].filter((value): value is string => Boolean(value))
  const lastActivity = activityDates.sort().at(-1)
  const inactiveDays = days(lastActivity ?? objective.updatedAt ?? objective.createdAt, now)

  const observedCommitmentScore = clamp(completedTasks.length * 10 + completedSessions.length * 14 + selected * 10 + recentSessions.length * 5)
  const lifeAreaMatch = Boolean(context.primaryLifeArea && (objective.lifeArea === context.primaryLifeArea || objective.domain === context.primaryLifeArea))
  const lifeImpactScore = clamp(declaredImportanceScore * 0.7 + (lifeAreaMatch ? 20 : 5))
  const avoidanceScore = clamp(skipped * 16 + aborted * 18 + rejected * 10 + (declaredImportanceScore >= 80 && inactiveDays >= 7 ? 25 : 0))
  const stagnationScore = objective.status === 'completed' ? 0 : clamp(inactiveDays === Infinity ? 35 : inactiveDays * 5 + (completedTasks.length === 0 ? 15 : 0))
  const momentumScore = clamp(recentCompletedTasks.length * 22 + recentSessions.length * 18 + selected * 8)
  const signalCount = linkedTasks.length + linkedSessions.length + linkedEvents.length + objectiveCorrections.length
  const contradiction = declaredImportanceScore >= 80 && observedCommitmentScore <= 20
  const confidence = clamp(Math.min(90, 20 + signalCount * 7 + objectiveCorrections.length * 12) - (contradiction ? 12 : 0))
  const reasons: string[] = [`Importance déclarée évaluée à ${declaredImportanceScore}/100.`]
  if (recentSessions.length || recentCompletedTasks.length) reasons.push('Une progression récente soutient le momentum de cet objectif.')
  if (inactiveDays >= 7 && objective.status !== 'completed') reasons.push('Aucune progression récente n’a été observée.')
  if (avoidanceScore >= 50) reasons.push('Cet objectif reste important mais plusieurs signaux indiquent qu’il est repoussé.')
  if (confidence < 45) reasons.push('La confiance reste basse faute de signaux suffisants.')
  if (latestStrong) reasons.push('Une correction utilisateur récente a été prise en compte.')

  return { objectiveId: objective.id, declaredImportanceScore, observedCommitmentScore, lifeImpactScore, avoidanceScore, stagnationScore, momentumScore, confidence, reasons, updatedAt: nowIso }
}
