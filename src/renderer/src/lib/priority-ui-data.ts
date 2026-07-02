import type { PriorityScoreV2, PriorityUiData } from '@shared/priority-score-model'

function priorityLabel(score: number): PriorityUiData['priorityLabel'] {
  if (score >= 85) return 'critical'
  if (score >= 65) return 'high'
  if (score >= 35) return 'medium'
  if (score > 0) return 'low'
  return 'none'
}

function feasibilityLabel(score: number): PriorityUiData['feasibilityLabel'] {
  if (score >= 80) return 'easy'
  if (score >= 55) return 'possible'
  if (score >= 35) return 'tight'
  if (score >= 15) return 'hard'
  return 'impossible'
}

function protectionLabel(score: number): PriorityUiData['protectionLabel'] {
  if (score >= 85) return 'strict'
  if (score >= 65) return 'strong'
  if (score >= 35) return 'normal'
  if (score > 0) return 'light'
  return 'none'
}

function confidenceLabel(score: number): PriorityUiData['confidenceLabel'] {
  if (score >= 70) return 'high'
  if (score >= 45) return 'medium'
  return 'low'
}

export function buildPriorityUiData(score: PriorityScoreV2): PriorityUiData {
  return {
    targetType: score.targetType,
    targetId: score.targetId,
    priorityLabel: priorityLabel(score.totalScore),
    mainReason: score.explanation.reasons[0] ?? score.recommendation.reason,
    urgencyLabel: score.recommendation.urgencyLabel,
    riskLabel: score.recommendation.riskLabel,
    feasibilityLabel: feasibilityLabel(score.dimensions.feasibilityScore),
    nextAction: score.recommendation.recommendedAction,
    protectionLabel: protectionLabel(score.protectionPriorityScore),
    confidenceLabel: confidenceLabel(score.confidence),
    why: score.explanation.reasons.slice(0, 5),
    warnings: score.explanation.warnings.slice(0, 4),
  }
}
