import type { ExecutionPreviewPlanV2, ExecutionPreviewExplanation } from '@shared/execution-preview-model'

export function explainExecutionPreviewPlan(plan: Omit<ExecutionPreviewPlanV2, 'explanation'>): ExecutionPreviewExplanation {
  const title = 'Execution Preview'
  let summary = 'Vethos has prepared a preview of this schedule.'
  const warnings: string[] = []
  let nextRecommendedAction: ExecutionPreviewExplanation['nextRecommendedAction'] = 'show_debug_preview'

  const { readiness, safety, summary: stats } = plan

  if (safety.status === 'critical' || safety.status === 'unsafe') {
    summary = 'This preview contains unsafe or real actions and cannot be applied.'
    warnings.push('CRITICAL: Des actions réelles ont été détectées dans le plan proposé.')
    nextRecommendedAction = 'do_not_apply'
  } else if (readiness.readiness === 'blocked' || readiness.readiness === 'partial_preview_only') {
    summary = 'This preview is incomplete due to missing dependencies.'
    nextRecommendedAction = 'fix_inputs_first'
  } else if (readiness.readiness === 'manual_review_required') {
    summary = 'This preview requires manual review before it can be considered stable.'
    nextRecommendedAction = 'ask_manual_review'
  } else {
    // Healthy preview
    if (plan.days?.some((day) => day.summary.rescueMinutes > 0)) {
      summary = 'Vethos can display a preview. This schedule includes rescue modes due to time constraints.'
    } else {
      summary = 'Vethos can display a preview of the upcoming sessions and protection rules.'
    }
    nextRecommendedAction = 'show_ui_preview'
  }

  return {
    title,
    summary,
    keyDecisions: [
      `Total proposed work: ${stats.totalProposedMinutes} minutes.`,
      `Safety status: ${safety.status}.`,
      'Vethos will not apply any real actions at this stage.'
    ],
    warnings,
    nextRecommendedAction,
    confidence: plan.confidence
  }
}
