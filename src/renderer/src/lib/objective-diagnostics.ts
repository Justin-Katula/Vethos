import type { ObjectiveModelV2 } from '@shared/objective-model'

export type ObjectiveDiagnosticIssue = {
  objectiveId: string
  code: string
  severity: 'warning' | 'critical'
  message: string
}

export type ObjectiveDiagnostics = {
  status: 'healthy' | 'warning' | 'critical'
  issues: ObjectiveDiagnosticIssue[]
  summary: string
}

/** Read-only diagnostics. It never mutates an objective, task, or planning state. */
export function runObjectiveDiagnostics(models: readonly ObjectiveModelV2[]): ObjectiveDiagnostics {
  const issues: ObjectiveDiagnosticIssue[] = []
  const add = (model: ObjectiveModelV2, code: string, severity: ObjectiveDiagnosticIssue['severity'], message: string): void => {
    issues.push({ objectiveId: model.identity.objectiveId, code, severity, message })
  }
  for (const model of models) {
    if (model.status.isActive && model.progress.totalTaskCount === 0) add(model, 'active_without_task', 'critical', 'Objectif actif sans tâche concrète.')
    if (model.mission.declaredImportanceScore >= 60 && !model.status.lastSessionAt) add(model, 'important_without_session', 'warning', 'Objectif important sans session liée connue.')
    if (model.progress.activeTaskCount > 3) add(model, 'too_many_active_tasks', 'warning', 'Plus de trois tâches sont actives pour cet objectif.')
    if (model.progress.expiredTaskCount > 0) add(model, 'expired_tasks', 'warning', 'Des tâches liées ont expiré.')
    if (!model.mission.reasonWhy && model.mission.missionStatement === model.identity.title) add(model, 'missing_mission', 'warning', 'La raison d’être de l’objectif reste à préciser.')
    if (model.progress.progressSource === 'none' && model.progress.totalTaskCount > 0) add(model, 'uncalculable_progress', 'critical', 'La progression ne peut pas être calculée avec les données disponibles.')
    if (model.risk.overallRiskScore >= 65 && model.protection.recommendedProtectionLevel < 40) add(model, 'weak_protection_high_risk', 'critical', 'Protection faible malgré un risque élevé.')
    if (model.risk.noNextActionRisk >= 85) add(model, 'critical_no_next_action', 'critical', 'Aucune prochaine action n’est disponible.')
  }
  const status = issues.some((issue) => issue.severity === 'critical') ? 'critical' : issues.length ? 'warning' : 'healthy'
  return { status, issues, summary: issues.length ? `${issues.length} incohérence(s) détectée(s) sur ${models.length} objectif(s).` : `${models.length} objectif(s) vérifié(s), aucune incohérence détectée.` }
}
