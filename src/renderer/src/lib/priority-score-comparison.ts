import type { PriorityScoreComparison, PriorityScoreV2 } from '@shared/priority-score-model'

export type PriorityScoreComparisonContext = {
  conflictThreshold?: number
  highScoreThreshold?: number
  lowScoreThreshold?: number
}

export function compareOldAndNewPriorityScore(
  oldScore: number | undefined,
  priorityScoreV2: PriorityScoreV2 | undefined,
  context: PriorityScoreComparisonContext = {},
): PriorityScoreComparison {
  const high = context.highScoreThreshold ?? 65
  const low = context.lowScoreThreshold ?? 35
  const conflict = context.conflictThreshold ?? 35

  if (!priorityScoreV2) {
    return {
      oldScore,
      newTotalScore: 0,
      differenceLabel: 'new_missing',
      explanation: ['Le score V2 est absent.'],
      shouldInspect: true,
    }
  }
  if (oldScore === undefined) {
    return {
      targetType: priorityScoreV2.targetType,
      targetId: priorityScoreV2.targetId,
      oldScore,
      newTotalScore: priorityScoreV2.totalScore,
      differenceLabel: 'old_missing',
      explanation: ['Aucun ancien score disponible : V2 reste en observation.'],
      shouldInspect: false,
    }
  }

  const diff = priorityScoreV2.totalScore - oldScore
  const conflictDetected = Math.abs(diff) >= conflict || (oldScore >= high && priorityScoreV2.totalScore <= low) || (oldScore <= low && priorityScoreV2.totalScore >= high)
  const explanation: string[] = []
  if (conflictDetected) {
    explanation.push('Ancien score et score V2 ne racontent pas la même histoire.')
  } else if (Math.abs(diff) <= 10) {
    explanation.push('Ancien score et score V2 vont dans la même direction.')
  } else if (diff > 0) {
    explanation.push('V2 donne une priorité plus haute grâce aux signaux multi-dimensions.')
  } else {
    explanation.push('V2 baisse la priorité après avoir tenu compte de la faisabilité, ambiguïté ou validation.')
  }
  if (priorityScoreV2.dimensions.ambiguityPenalty >= 70 && priorityScoreV2.totalScore >= high) {
    explanation.push('Attention : tâche vague avec score encore haut.')
  }
  if (priorityScoreV2.dimensions.deadlinePressureScore >= 85 && priorityScoreV2.dimensions.urgencyScore < 50) {
    explanation.push('Possible incohérence : pression de deadline forte mais urgence basse.')
  }

  return {
    targetType: priorityScoreV2.targetType,
    targetId: priorityScoreV2.targetId,
    oldScore,
    newTotalScore: priorityScoreV2.totalScore,
    differenceLabel: conflictDetected ? 'conflict' : Math.abs(diff) <= 10 ? 'same_direction' : diff > 0 ? 'v2_higher' : 'v2_lower',
    explanation,
    shouldInspect: conflictDetected,
  }
}
