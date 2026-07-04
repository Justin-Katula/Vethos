import type { PlacementCandidate, PlacementMode } from '@shared/placement-model'

// Minimal interfaces for input data so we don't depend on actual real stores.
export interface AnyTaskModel {
  id: string
  title?: string
  status?: 'active' | 'completed' | 'completed_verified' | 'expired' | 'stagnant' | 'avoided'
  recommendedAction?: 'split_first' | 'clarify' | 'do'
  progressPercent?: number
  remainingMinutes?: number
  estimatedMinutes?: number
  requiresDeepWork?: boolean
  deadline?: string
  isVague?: boolean
  tags?: string[]
}

export interface AnyObjectiveModel {
  id: string
  title?: string
  status?: 'active' | 'completed' | 'completed_verified'
  hasClearNextAction?: boolean
}

export interface AnyPriorityScore {
  targetId: string
  priorityScore: number
  actionPriorityScore?: number
  planningPriorityScore?: number
  protectionPriorityScore?: number
  recoveryPriorityScore?: number
  urgencyLevel?: 'none' | 'low' | 'medium' | 'high' | 'critical'
  riskLevel?: 'low' | 'medium' | 'high' | 'critical'
}

export interface AnyDeadlineCrisisContext {
  targetId: string
  crisisLevel: string
  recommendedMode: 'normal_plan' | 'intensive_plan' | 'rescue_plan' | 'minimum_viable_plan' | 'manual_review'
  recommendedStrategy?: {
    strategyType?: 'practice' | 'review' | 'high_yield' | 'diagnostic' | 'summary' | 'work'
    focus?: string
  }
}

export interface BuildPlacementCandidatesInput {
  taskModelsV2?: AnyTaskModel[]
  objectiveModelsV2?: AnyObjectiveModel[]
  priorityScoresV2?: AnyPriorityScore[]
  deadlineCrisisContexts?: AnyDeadlineCrisisContext[]
  userModel?: unknown
  now?: string
}

export function buildPlacementCandidates(input: BuildPlacementCandidatesInput): PlacementCandidate[] {
  const candidates: PlacementCandidate[] = []

  const tasks = input.taskModelsV2 ?? []
  const objectives = input.objectiveModelsV2 ?? []
  const scores = input.priorityScoresV2 ?? []
  const contexts = input.deadlineCrisisContexts ?? []

  const scoreMap = new Map(scores.map((s) => [s.targetId, s]))
  const contextMap = new Map(contexts.map((c) => [c.targetId, c]))

  for (const task of tasks) {
    if (task.status === 'completed_verified') {
      continue
    }
    // Completed or expired tasks are ignored unless they are part of a special review context,
    // but the prompt says they can be ignored for now.
    if (task.status === 'completed' || task.status === 'expired') {
      continue
    }

    const score = scoreMap.get(task.id)
    const crisis = contextMap.get(task.id)

    const isVague = task.isVague === true || task.recommendedAction === 'clarify'
    const needsSplit = task.recommendedAction === 'split_first'
    const isAlmostDone = (task.progressPercent ?? 0) >= 90

    let remainingMinutes = task.remainingMinutes ?? task.estimatedMinutes ?? 60
    if (remainingMinutes <= 0) remainingMinutes = 60

    let minimumUsefulMinutes = 30
    let recommendedMinutes = remainingMinutes > 120 ? 90 : remainingMinutes
    let maximumSafeMinutes = 180
    let requiresDeepWork = task.requiresDeepWork ?? false
    let canSplit = true
    let canUseShortGap = false

    let placementModeHint: PlacementMode | undefined = undefined

    const reasons: string[] = []
    const warnings: string[] = []

    if (crisis) {
      if (crisis.recommendedMode === 'rescue_plan') placementModeHint = 'rescue'
      else if (crisis.recommendedMode === 'minimum_viable_plan') placementModeHint = 'minimum_viable'
      else if (crisis.recommendedMode === 'manual_review') placementModeHint = 'manual_review'
      else if (crisis.recommendedMode === 'intensive_plan') placementModeHint = 'intensive'
    }

    if (isVague || needsSplit) {
      // Vague or needs split -> short review/clarify action, not deep work
      remainingMinutes = 20
      minimumUsefulMinutes = 10
      recommendedMinutes = 20
      maximumSafeMinutes = 45
      requiresDeepWork = false
      canUseShortGap = true
      placementModeHint = 'manual_review'
      reasons.push(isVague ? 'Tâche vague nécessitant clarification.' : 'Tâche trop grande nécessitant un découpage.')
    } else if (isAlmostDone) {
      minimumUsefulMinutes = 10
      recommendedMinutes = Math.min(30, remainingMinutes)
      maximumSafeMinutes = 60
      canUseShortGap = true
      reasons.push('Tâche presque terminée, priorisée pour complétion rapide.')
    } else if (requiresDeepWork) {
      minimumUsefulMinutes = 45
      recommendedMinutes = Math.min(90, remainingMinutes)
      canUseShortGap = false
      reasons.push('Nécessite du travail profond (deep work).')
    } else {
      // Standard task
      minimumUsefulMinutes = 20
      recommendedMinutes = Math.min(60, remainingMinutes)
      canUseShortGap = true
    }

    candidates.push({
      id: `cand-t-${task.id}`,
      targetType: 'task',
      targetId: task.id,
      targetStatus: task.status,
      title: task.title ?? 'Tâche sans nom',
      remainingMinutes,
      minimumUsefulMinutes,
      recommendedMinutes,
      maximumSafeMinutes,
      requiresDeepWork,
      canSplit,
      canUseShortGap,
      shouldAvoidLateNight: requiresDeepWork, // Avoid deep work late at night by default
      deadline: task.deadline,
      priorityScore: score?.priorityScore ?? 50,
      actionPriorityScore: score?.actionPriorityScore,
      planningPriorityScore: score?.planningPriorityScore,
      protectionPriorityScore: score?.protectionPriorityScore,
      recoveryPriorityScore: score?.recoveryPriorityScore,
      urgencyLevel: score?.urgencyLevel,
      riskLevel: score?.riskLevel,
      placementModeHint,
      reasons,
      warnings,
      confidence: 80, // Default confidence
    })
  }

  for (const obj of objectives) {
    if (obj.status === 'completed' || obj.status === 'completed_verified') {
      continue
    }

    const score = scoreMap.get(obj.id)
    
    // Objectives without clear tasks shouldn't be scheduled as heavy concrete work
    if (obj.hasClearNextAction === false) {
      candidates.push({
        id: `cand-o-${obj.id}`,
        targetType: 'objective',
        targetId: obj.id,
        targetStatus: obj.status,
        title: obj.title ?? 'Objectif sans nom',
        remainingMinutes: 30,
        minimumUsefulMinutes: 15,
        recommendedMinutes: 30,
        maximumSafeMinutes: 60,
        requiresDeepWork: false,
        canSplit: true,
        canUseShortGap: true,
        shouldAvoidLateNight: false,
        priorityScore: score?.priorityScore ?? 50,
        actionPriorityScore: score?.actionPriorityScore,
        planningPriorityScore: score?.planningPriorityScore,
        protectionPriorityScore: score?.protectionPriorityScore,
        recoveryPriorityScore: score?.recoveryPriorityScore,
        urgencyLevel: score?.urgencyLevel,
        riskLevel: score?.riskLevel,
        placementModeHint: 'manual_review',
        reasons: ['Objectif sans prochaine action claire. Propose une session de révision/création de tâche.'],
        warnings: [],
        confidence: 80,
      })
    }
  }

  return candidates
}
