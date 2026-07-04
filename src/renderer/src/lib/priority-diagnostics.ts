import type { DiagnosticIssue, PriorityScoreDiagnostics, PriorityScoreSnapshot, PriorityScoreV2 } from '@shared/priority-score-model'

function issue(id: string, message: string, score?: PriorityScoreV2, severity: DiagnosticIssue['severity'] = 'warning'): DiagnosticIssue {
  return {
    id,
    severity,
    targetType: score?.targetType,
    targetId: score?.targetId,
    message,
    debug: score
      ? {
          totalScore: score.totalScore,
          actionPriorityScore: score.actionPriorityScore,
          confidence: score.confidence,
        }
      : undefined,
  }
}

export function runPriorityScoreDiagnostics(snapshot: Pick<PriorityScoreSnapshot, 'taskScores' | 'objectiveScores' | 'comparisons'>): PriorityScoreDiagnostics {
  const issues: DiagnosticIssue[] = []
  const all = [...snapshot.taskScores, ...snapshot.objectiveScores]

  for (const score of all) {
    if (score.recommendation.recommendedAction === 'ignore_for_now' && score.totalScore > 30) {
      issues.push(issue('completed_score_high', 'Un élément ignoré/terminé possède encore un score haut.', score, 'critical'))
    }
    if (score.targetType === 'task' && score.totalScore === 0 && score.recommendation.recommendedAction !== 'ignore_for_now') {
      issues.push(issue('active_score_zero', 'Une tâche non terminée a un score zéro sans raison claire.', score))
    }
    if (score.dimensions.deadlinePressureScore >= 85 && score.dimensions.urgencyScore < 55) {
      issues.push(issue('critical_deadline_low_urgency', 'Deadline critique mais urgence basse.', score, 'critical'))
    }
    if (score.dimensions.ambiguityPenalty >= 70 && score.actionPriorityScore >= 65) {
      issues.push(issue('vague_task_high_action', 'Élément vague avec priorité d’action haute.', score))
    }
    if (score.totalScore >= 70 && score.confidence < 45) {
      issues.push(issue('high_score_low_confidence', 'Score élevé avec confiance faible.', score))
    }
    if (score.dimensions.feasibilityScore < 25 && score.planningPriorityScore >= 60) {
      issues.push(issue('impossible_planning_high', 'Élément peu faisable avec score planning élevé.', score, 'critical'))
    }
    if (score.protectionPriorityScore >= 75 && score.explanation.reasons.length === 0) {
      issues.push(issue('protection_without_reason', 'Protection haute sans raison lisible.', score))
    }
    if (
      score.targetType === 'objective' &&
      score.dimensions.importanceScore >= 75 &&
      score.recommendation.recommendedAction !== 'ignore_for_now' &&
      score.metadata.debug?.linkedTaskScoreCount === 0
    ) {
      issues.push(issue('central_objective_no_active_tasks', 'Objectif central actif sans tâche active liée.', score))
    }
  }

  const roundedScores = new Set(all.map((score) => Math.round(score.totalScore / 5) * 5))
  if (all.length >= 4 && roundedScores.size <= 1) {
    issues.push(issue('all_scores_equal', 'Tous les scores V2 semblent identiques : le moteur ne discrimine pas assez.'))
  }
  for (const comparison of snapshot.comparisons) {
    if (comparison.differenceLabel === 'conflict' && comparison.shouldInspect) {
      issues.push({
        id: 'old_new_conflict',
        severity: 'warning',
        targetType: comparison.targetType,
        targetId: comparison.targetId,
        message: 'Ancien score et score V2 sont contradictoires.',
        debug: { oldScore: comparison.oldScore, newTotalScore: comparison.newTotalScore },
      })
    }
  }

  const criticalCount = issues.filter((item) => item.severity === 'critical').length
  const status = criticalCount > 0 ? 'critical' : issues.length > 0 ? 'warning' : 'healthy'
  return {
    status,
    issues,
    summary:
      status === 'healthy'
        ? ['Le système de priorité V2 semble sain en mode consultatif (aide à la décision).']
        : [`${issues.length} problème(s) détecté(s), dont ${criticalCount} critique(s).`],
  }
}
