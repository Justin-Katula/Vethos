import { ExecutionPreviewQaReport } from '@shared/execution-preview-qa-model'

export function explainExecutionPreviewQaReport(
  report: ExecutionPreviewQaReport
): ExecutionPreviewQaReport['explanation'] {
  const keyFindings: string[] = []

  let title = 'Rapport Qualité de la Preview'
  let summary = ''
  let nextRecommendedAction: ExecutionPreviewQaReport['explanation']['nextRecommendedAction'] = 'manual_review'

  if (report.qualityScore.status === 'excellent' || report.qualityScore.status === 'good') {
    title = 'Preview cohérente et stable'
    summary = 'La preview est utilisable en debug. Les données ont été correctement mappées et les vérifications sont au vert.'
    nextRecommendedAction = 'keep_debug_only'
  } else if (report.qualityScore.status === 'unsafe' || report.qualityScore.status === 'invalid') {
    title = 'Preview dangereuse ou invalide'
    summary = 'La safety est critique ou les données sont invalides : ne pas activer.'
    nextRecommendedAction = 'do_not_activate'
  } else if (report.qualityScore.status === 'weak' || report.qualityScore.status === 'partial') {
    title = 'Preview incomplète'
    if (report.mappingAudit.tasks.sourceCount > 0 && report.mappingAudit.tasks.mappedCount === 0) {
      summary = 'Les données réelles sont lues correctement, mais le mapping des tâches est faible.'
      nextRecommendedAction = 'fix_preview_pipeline'
    } else if (!report.mappingAudit.planning.hasScheduleData) {
      summary = 'Le planning semble absent, donc la preview ne peut pas juger le temps disponible.'
      nextRecommendedAction = 'collect_more_real_data'
    } else {
      summary = 'La preview manque de données ou présente des lacunes.'
      nextRecommendedAction = 'fix_data_mapping'
    }
  } else {
    title = 'Preview nécessitant une attention'
    summary = 'Des avertissements ont été détectés, une revue manuelle est suggérée.'
    nextRecommendedAction = 'manual_review'
  }

  // Populate key findings based on checks and reasons
  if (report.qualityScore.reasons.length > 0) {
    keyFindings.push(...report.qualityScore.reasons)
  }
  const mappingWarnings = [
    ...report.mappingAudit.tasks.warnings,
    ...report.mappingAudit.objectives.warnings,
    ...report.mappingAudit.planning.warnings,
    ...report.mappingAudit.appsAndSites.warnings
  ]
  if (mappingWarnings.length > 0) {
    keyFindings.push(...mappingWarnings)
  }
  
  // Deduplicate and limit to top 5
  const uniqueFindings = Array.from(new Set(keyFindings)).slice(0, 5)

  return {
    title,
    summary,
    keyFindings: uniqueFindings,
    nextRecommendedAction
  }
}
