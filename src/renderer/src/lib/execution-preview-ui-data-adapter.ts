import type { ExecutionPreviewPlanV2 } from '@shared/execution-preview-model'

export function buildExecutionPreviewUiData(plan: ExecutionPreviewPlanV2) {
  const actions: Array<{
    label: string
    actionType: 'debug_only' | 'manual_review' | 'fix_inputs' | 'rebuild_shadow' | 'disabled_apply'
    enabled: boolean
    reason: string
  }> = []

  // No matter what, real application is disabled
  actions.push({
    label: 'Apply Plan',
    actionType: 'disabled_apply',
    enabled: false,
    reason: 'Point 10 is shadow and preview-only. Real actions are disabled.'
  })

  if (plan.readiness.readiness === 'manual_review_required') {
    actions.push({
      label: 'Manual Review',
      actionType: 'manual_review',
      enabled: true,
      reason: 'Review is required before considering stable.'
    })
  }

  if (plan.readiness.readiness === 'blocked' || plan.readiness.readiness === 'partial_preview_only') {
    actions.push({
      label: 'Fix Inputs',
      actionType: 'fix_inputs',
      enabled: true,
      reason: 'Dependencies are missing.'
    })
  }

  return {
    title: plan.explanation.title,
    status: plan.status,
    days: plan.days.map(d => ({
      date: d.date,
      status: d.status,
      blocks: d.blocks.map(b => ({
        title: b.title,
        time: `${b.start} - ${b.end}`,
        kind: b.previewKind,
        readiness: b.readiness,
        protectionMode: b.protectionMode,
        warnings: b.warnings
      })),
      summary: [
        `Work: ${d.summary.proposedWorkMinutes}m`,
        `Deep Work: ${d.summary.deepWorkMinutes}m`,
        `Rescue: ${d.summary.rescueMinutes}m`
      ]
    })),
    warnings: plan.explanation.warnings,
    actions
  }
}
