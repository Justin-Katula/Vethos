import { ManualReviewDraftV2 } from '../../../shared/manual-review-gate-model'

export interface BuildManualReviewDraftInput {
  previewPlan?: any
  qaReport?: any
  existingLocalDraft?: ManualReviewDraftV2
  now?: string
  idFactory?: () => string
}

export function buildManualReviewDraft(input: BuildManualReviewDraftInput): ManualReviewDraftV2 {
  const { previewPlan, qaReport, existingLocalDraft, now = new Date().toISOString(), idFactory = () => `draft-${Date.now()}` } = input

  let status: ManualReviewDraftV2['status'] = 'not_started'
  let blockers: string[] = []
  
  if (!previewPlan) {
    status = 'invalid'
    blockers.push('Preview plan is missing')
  }

  // Safety check on QA report
  if (qaReport && qaReport.qualityScore) {
    if (qaReport.qualityScore.status === 'unsafe' || qaReport.qualityScore.status === 'critical') {
      status = 'blocked_by_safety'
      blockers.push('QA report indicates critical or unsafe preview')
    }
  }

  if (status === 'not_started' && existingLocalDraft) {
    status = existingLocalDraft.status
  }

  const validBlockIds = new Set<string>()
  if (previewPlan && previewPlan.days) {
    for (const day of previewPlan.days) {
      if (day.blocks) {
        for (const block of day.blocks) {
          validBlockIds.add(block.id)
        }
      }
    }
  }

  // filter invalid decisions if we have an existing draft
  let blockDecisions = existingLocalDraft ? [...existingLocalDraft.blockDecisions] : []
  let dayDecisions = existingLocalDraft ? [...existingLocalDraft.dayDecisions] : []
  let decisions = existingLocalDraft ? [...existingLocalDraft.decisions] : []

  if (previewPlan) {
    blockDecisions = blockDecisions.filter(d => validBlockIds.has(d.blockId))
    decisions = decisions.filter(d => {
      if (d.targetType === 'block' && d.targetId) {
        return validBlockIds.has(d.targetId)
      }
      return true
    })
  }

  return {
    id: existingLocalDraft?.id || idFactory(),
    previewPlanId: previewPlan?.id,
    qaReportId: qaReport?.id,
    status,
    previewDecision: existingLocalDraft?.previewDecision || 'undecided',
    dayDecisions,
    blockDecisions,
    decisions,
    warnings: [],
    blockers,

    // DANGEROUS FLAGS ALWAYS FALSE
    canCreateSessions: false,
    canStartSessions: false,
    canApplyPlanning: false,
    canApplyBlocking: false,
    canCompleteTasks: false,
    canPersistReview: false,
    canProceedToActivationBridge: false,

    confidence: 1,
    metadata: {
      source: 'manual_review_gate',
      createdAt: existingLocalDraft?.metadata.createdAt || now,
      updatedAt: now,
      modelVersion: 1
    }
  }
}
