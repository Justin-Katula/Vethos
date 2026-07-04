import type {
  PriorityRecommendation,
  PriorityScoreDimensions,
  PriorityTargetType,
} from '@shared/priority-score-model'

export type BuildPriorityRecommendationInput = {
  targetType: PriorityTargetType
  dimensions: PriorityScoreDimensions
  scores: {
    totalScore: number
    actionPriorityScore: number
    planningPriorityScore: number
    protectionPriorityScore: number
    recoveryPriorityScore: number
  }
  suggestedDurationMinutes?: number
  isCompleted?: boolean
  completionVerified?: boolean
  completionClaimed?: boolean
  completionRejected?: boolean
  deadlineStatus?: string
  nextStepKind?: string
  hasNoNextAction?: boolean
  confidence: number
}

function label(score: number): 'none' | 'low' | 'medium' | 'high' | 'critical' {
  if (score >= 85) return 'critical'
  if (score >= 65) return 'high'
  if (score >= 35) return 'medium'
  if (score > 0) return 'low'
  return 'none'
}

function riskLabel(dimensions: PriorityScoreDimensions): PriorityRecommendation['riskLabel'] {
  const risk = Math.max(
    dimensions.deadlinePressureScore,
    dimensions.stagnationScore,
    dimensions.avoidanceScore,
    dimensions.overloadPenalty,
  )
  if (risk >= 85) return 'critical'
  if (risk >= 65) return 'at_risk'
  if (risk >= 35) return 'watch'
  return 'safe'
}

export function buildPriorityRecommendation(input: BuildPriorityRecommendationInput): PriorityRecommendation {
  const d = input.dimensions
  const suggestedDurationMinutes = input.suggestedDurationMinutes

  if (input.completionVerified || input.isCompleted) {
    return {
      recommendedAction: 'ignore_for_now',
      suggestedDurationMinutes,
      reason: 'Cette priorité est déjà validée comme terminée.',
      urgencyLabel: 'none',
      riskLabel: 'safe',
      confidence: input.confidence,
    }
  }

  if (input.confidence < 35) {
    return {
      recommendedAction: 'manual_review',
      suggestedDurationMinutes,
      reason: 'Les données sont trop faibles pour décider proprement.',
      urgencyLabel: label(d.urgencyScore),
      riskLabel: riskLabel(d),
      confidence: input.confidence,
    }
  }

  if (input.hasNoNextAction && input.targetType === 'objective') {
    return {
      recommendedAction: d.stagnationScore >= 65 ? 'recover' : 'create_task',
      suggestedDurationMinutes: 15,
      reason: 'L’objectif a besoin d’une prochaine action claire avant d’être planifié.',
      urgencyLabel: label(d.urgencyScore),
      riskLabel: riskLabel(d),
      confidence: input.confidence,
    }
  }

  if (d.ambiguityPenalty >= 70 || input.nextStepKind === 'clarify_task') {
    return {
      recommendedAction: 'clarify_first',
      suggestedDurationMinutes: Math.min(15, suggestedDurationMinutes ?? 15),
      reason: 'Cette priorité est trop vague pour être exécutée correctement.',
      urgencyLabel: label(d.urgencyScore),
      riskLabel: riskLabel(d),
      confidence: input.confidence,
    }
  }

  if (d.overloadPenalty >= 75 || input.nextStepKind === 'split_task' || input.deadlineStatus === 'impossible') {
    return {
      recommendedAction: 'split_first',
      suggestedDurationMinutes: Math.min(20, suggestedDurationMinutes ?? 20),
      reason: 'Le travail est trop gros ou trop serré pour être traité naïvement.',
      urgencyLabel: label(d.urgencyScore),
      riskLabel: riskLabel(d),
      confidence: input.confidence,
    }
  }

  if (input.deadlineStatus === 'overdue' || input.completionRejected) {
    return {
      recommendedAction: 'recover',
      suggestedDurationMinutes,
      reason: input.completionRejected
        ? 'La complétion a été refusée : Vethos doit reprendre cette tâche sérieusement.'
        : 'Cette priorité est en retard et doit être sauvée ou révisée.',
      urgencyLabel: label(Math.max(85, d.urgencyScore)),
      riskLabel: riskLabel(d),
      confidence: input.confidence,
    }
  }

  if (d.urgencyScore >= 85 && d.feasibilityScore >= 45) {
    return {
      recommendedAction: input.scores.actionPriorityScore >= input.scores.planningPriorityScore ? 'do_now' : 'schedule_today',
      suggestedDurationMinutes,
      reason: 'Urgence forte et faisabilité suffisante.',
      urgencyLabel: 'critical',
      riskLabel: riskLabel(d),
      confidence: input.confidence,
    }
  }

  if (d.urgencyScore >= 85 && d.feasibilityScore < 45) {
    return {
      recommendedAction: 'manual_review',
      suggestedDurationMinutes,
      reason: 'L’urgence est critique, mais le plan actuel n’est pas faisable.',
      urgencyLabel: 'critical',
      riskLabel: 'critical',
      confidence: input.confidence,
    }
  }

  if (d.stagnationScore >= 65 && d.avoidanceScore >= 45 && d.importanceScore >= 60) {
    return {
      recommendedAction: 'recover',
      suggestedDurationMinutes,
      reason: 'Cette priorité semble évitée ou stagnante malgré son importance.',
      urgencyLabel: label(d.urgencyScore),
      riskLabel: riskLabel(d),
      confidence: input.confidence,
    }
  }

  if (input.scores.protectionPriorityScore >= 75) {
    return {
      recommendedAction: 'protect_strongly',
      suggestedDurationMinutes,
      reason: 'Cette priorité demande une protection forte contre les distractions.',
      urgencyLabel: label(d.urgencyScore),
      riskLabel: riskLabel(d),
      confidence: input.confidence,
    }
  }

  if (d.momentumScore >= 70 && input.scores.actionPriorityScore >= 50) {
    return {
      recommendedAction: 'do_now',
      suggestedDurationMinutes,
      reason: 'Il y a un bon momentum : continuer maintenant peut éviter de perdre l’élan.',
      urgencyLabel: label(d.urgencyScore),
      riskLabel: riskLabel(d),
      confidence: input.confidence,
    }
  }

  if (input.scores.planningPriorityScore >= 55) {
    return {
      recommendedAction: d.urgencyScore >= 60 ? 'schedule_today' : 'schedule_soon',
      suggestedDurationMinutes,
      reason: 'Cette priorité mérite un bloc dans le planning.',
      urgencyLabel: label(d.urgencyScore),
      riskLabel: riskLabel(d),
      confidence: input.confidence,
    }
  }

  return {
    recommendedAction: input.scores.totalScore >= 35 ? 'wait' : 'ignore_for_now',
    suggestedDurationMinutes,
    reason: input.scores.totalScore >= 35 ? 'À garder en vue, mais pas à pousser en premier.' : 'Pas prioritaire pour le moment.',
    urgencyLabel: label(d.urgencyScore),
    riskLabel: riskLabel(d),
    confidence: input.confidence,
  }
}
