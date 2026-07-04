import type {
  PriorityRankedItem,
  PriorityRankingMode,
  PriorityRankingResult,
  PriorityScoreV2,
} from '@shared/priority-score-model'

export type RankPriorityItemsV2Input = {
  tasks?: PriorityScoreV2[]
  objectives?: PriorityScoreV2[]
}

export type RankPriorityItemsV2Context = {
  mode: PriorityRankingMode
  now?: Date
  availableMinutes?: number
  includeCompleted?: boolean
  includeBlocked?: boolean
}

function modeScore(score: PriorityScoreV2, mode: PriorityRankingMode): number {
  if (mode === 'action') return score.actionPriorityScore
  if (mode === 'planning') return Math.round(score.planningPriorityScore * 0.85 + score.dimensions.feasibilityScore * 0.15)
  if (mode === 'protection') return score.protectionPriorityScore
  return score.recoveryPriorityScore
}

function tieBreakScore(score: PriorityScoreV2, context: RankPriorityItemsV2Context): number {
  let value = 0
  if (score.dimensions.deadlinePressureScore >= 85) value += 30
  if (score.dimensions.objectiveImpactScore >= 80) value += 22
  if (score.dimensions.momentumScore >= 70) value += 16
  if (score.dimensions.progressNeedScore >= 65 && score.recommendation.suggestedDurationMinutes && score.recommendation.suggestedDurationMinutes <= 35) {
    value += 14
  }
  if (score.dimensions.stagnationScore >= 70) value += 12
  value += score.confidence * 0.08
  value -= score.dimensions.ambiguityPenalty * 0.08
  if (context.mode === 'planning' && score.dimensions.feasibilityScore < 30) value -= 35
  return Math.round(value)
}

function shouldInclude(score: PriorityScoreV2, context: RankPriorityItemsV2Context): boolean {
  if (context.includeCompleted) return true
  return !(score.recommendation.recommendedAction === 'ignore_for_now' && score.totalScore === 0)
}

export function rankPriorityItemsV2(
  items: RankPriorityItemsV2Input,
  context: RankPriorityItemsV2Context,
): PriorityRankingResult {
  const all = [...(items.tasks ?? []), ...(items.objectives ?? [])].filter((score) => shouldInclude(score, context))
  const sorted = all
    .map((score) => ({
      score,
      modeScore: modeScore(score, context.mode),
      tieBreakScore: tieBreakScore(score, context),
    }))
    .sort((a, b) => {
      const byMode = b.modeScore - a.modeScore
      if (Math.abs(byMode) > 3) return byMode
      return b.tieBreakScore - a.tieBreakScore
    })

  const rankedItems: PriorityRankedItem[] = sorted.map((entry, index) => ({
    rank: index + 1,
    score: entry.score,
    modeScore: entry.modeScore,
    tieBreakScore: entry.tieBreakScore,
    reasons: entry.score.explanation.reasons.slice(0, 3),
  }))
  const ties = rankedItems
    .reduce<Array<{ itemIds: string[]; score: number }>>((acc, item) => {
      const existing = acc.find((group) => Math.abs(group.score - item.modeScore) <= 2)
      if (existing) existing.itemIds.push(item.score.targetId)
      else acc.push({ itemIds: [item.score.targetId], score: item.modeScore })
      return acc
    }, [])
    .filter((group) => group.itemIds.length > 1)
  const warnings: string[] = []
  if (context.mode === 'planning' && rankedItems[0]?.score.dimensions.feasibilityScore !== undefined && rankedItems[0].score.dimensions.feasibilityScore < 35) {
    warnings.push('La meilleure priorité de planning reste peu faisable : elle doit être découpée ou revue.')
  }
  if (rankedItems.length === 0) warnings.push('Aucune priorité classable en mode consultatif.')

  return {
    mode: context.mode,
    rankedItems,
    topItem: rankedItems[0],
    ties,
    warnings,
    explanation: [
      `Classement V2 calculé en mode ${context.mode}, sans changer l’ordre réel de l’interface.`,
      'Les égalités sont départagées par deadline, objectif central, momentum, tâche presque finie, stagnation et confiance.',
    ],
  }
}
