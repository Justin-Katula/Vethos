import type { PriorityExplanation, PriorityScoreDimensions, PriorityScoreV2 } from '@shared/priority-score-model'

function topPositiveDimensions(dimensions: PriorityScoreDimensions): string[] {
  const entries: Array<[keyof PriorityScoreDimensions, number, string]> = [
    ['urgencyScore', dimensions.urgencyScore, 'deadline ou urgence élevée'],
    ['importanceScore', dimensions.importanceScore, 'importance réelle élevée'],
    ['objectiveImpactScore', dimensions.objectiveImpactScore, 'impact fort sur un objectif'],
    ['deadlinePressureScore', dimensions.deadlinePressureScore, 'pression de deadline forte'],
    ['feasibilityScore', dimensions.feasibilityScore, 'faisabilité correcte'],
    ['workloadPressureScore', dimensions.workloadPressureScore, 'charge de travail importante'],
    ['progressNeedScore', dimensions.progressNeedScore, 'besoin de progression élevé'],
    ['stagnationScore', dimensions.stagnationScore, 'stagnation détectée'],
    ['avoidanceScore', dimensions.avoidanceScore, 'évitement détecté'],
    ['momentumScore', dimensions.momentumScore, 'momentum utile'],
    ['protectionNeedScore', dimensions.protectionNeedScore, 'besoin de protection élevé'],
  ]
  return entries
    .filter(([, score]) => score >= 60)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([, , reason]) => reason)
}

function warningsFor(dimensions: PriorityScoreDimensions, confidence: number): string[] {
  const warnings: string[] = []
  if (dimensions.ambiguityPenalty >= 65) warnings.push('La priorité est encore trop vague.')
  if (dimensions.overloadPenalty >= 75) warnings.push('Le travail semble trop lourd sans découpage.')
  if (dimensions.uncertaintyPenalty >= 60 || confidence < 45) warnings.push('La confiance des données reste faible.')
  if (dimensions.deadlinePressureScore >= 85 && dimensions.feasibilityScore < 45) {
    warnings.push('Le travail restant dépasse probablement le temps disponible.')
  }
  return warnings.slice(0, 4)
}

export function explainPriorityScore(priorityScore: PriorityScoreV2): PriorityExplanation {
  const reasons = [
    priorityScore.recommendation.reason,
    ...topPositiveDimensions(priorityScore.dimensions).map((reason) => `Signal principal : ${reason}.`),
  ].slice(0, 5)
  const warnings = warningsFor(priorityScore.dimensions, priorityScore.confidence)
  const targetLabel = priorityScore.targetType === 'task' ? 'Cette tâche' : 'Cet objectif'

  return {
    title: `${targetLabel} a une priorité ${priorityScore.totalScore >= 75 ? 'haute' : priorityScore.totalScore >= 45 ? 'moyenne' : 'faible'}.`,
    summary:
      priorityScore.recommendation.recommendedAction === 'clarify_first'
        ? `${targetLabel} doit d’abord être clarifié avant d’être traité comme une priorité d’exécution.`
        : priorityScore.recommendation.recommendedAction === 'split_first'
          ? `${targetLabel} doit être découpé avant d’être planifié naïvement.`
          : `${targetLabel} est évalué selon urgence, importance, faisabilité, risque et momentum.`,
    reasons,
    warnings,
    debug: {
      shadowOnly: true,
      actionPriorityScore: priorityScore.actionPriorityScore,
      planningPriorityScore: priorityScore.planningPriorityScore,
      protectionPriorityScore: priorityScore.protectionPriorityScore,
      recoveryPriorityScore: priorityScore.recoveryPriorityScore,
    },
  }
}
