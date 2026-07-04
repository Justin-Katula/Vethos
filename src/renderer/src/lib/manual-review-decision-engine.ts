import { ManualReviewDraftV2, ManualReviewDecisionV2 } from '../../../shared/manual-review-gate-model'

export interface ApplyManualReviewDecisionInput {
  draft: ManualReviewDraftV2
  decision: ManualReviewDecisionV2
  previewPlan?: any
  qaReport?: any
  settings?: { engineV2Execution?: boolean }
  now?: string
}

export function applyManualReviewDecisionToDraft(input: ApplyManualReviewDecisionInput): ManualReviewDraftV2 {
  const { draft, decision, previewPlan, qaReport, now = new Date().toISOString() } = input

  // DO NOT MUTATE THE ORIGINAL DRAFT. Create a new copy.
  const newDraft: ManualReviewDraftV2 = {
    ...draft,
    decisions: [...draft.decisions],
    blockDecisions: [...draft.blockDecisions],
    dayDecisions: [...draft.dayDecisions],
    warnings: [...draft.warnings],
    blockers: [...draft.blockers],
    metadata: {
      ...draft.metadata,
      updatedAt: now
    }
  }

  // Safety checks
  const executionEnabled = input.settings?.engineV2Execution === true

  if ((decision.canApplyDecision as boolean) === true && !executionEnabled) {
    newDraft.warnings.push('Received a decision with canApplyDecision set to true. Forcing to false.')
    ;(decision as { canApplyDecision: boolean }).canApplyDecision = false
  }

  if (qaReport && qaReport.qualityScore && (qaReport.qualityScore.status === 'unsafe' || qaReport.qualityScore.status === 'critical')) {
    if (decision.kind === 'approve_preview_in_principle') {
      newDraft.status = 'blocked_by_safety'
      newDraft.blockers.push('Cannot approve preview in principle because QA score is critical/unsafe.')
      return newDraft
    }
  }

  // Verify target existence for block/day
  if (decision.targetType === 'block' && decision.targetId) {
    let found = false
    if (previewPlan && previewPlan.days) {
      for (const day of previewPlan.days) {
        if (day.blocks?.some((b: any) => b.id === decision.targetId)) {
          found = true
          break
        }
      }
    }
    if (!found && previewPlan) {
      newDraft.warnings.push(`Decision targets a block (${decision.targetId}) that does not exist in the preview.`)
      return newDraft
    }
  }

  // Apply logic
  if (decision.kind === 'clear_local_review') {
    newDraft.status = 'not_started'
    newDraft.previewDecision = 'undecided'
    newDraft.blockDecisions = []
    newDraft.dayDecisions = []
    newDraft.decisions = []
    return newDraft
  }

  newDraft.decisions.push(decision)

  switch (decision.kind) {
    case 'approve_preview_in_principle':
      newDraft.status = 'approved_in_principle'
      newDraft.previewDecision = 'accepted_in_principle'
      break
    case 'reject_preview':
      newDraft.status = 'rejected'
      newDraft.previewDecision = 'rejected'
      break
    case 'request_changes':
      newDraft.status = 'changes_requested'
      newDraft.previewDecision = 'changes_requested'
      break
    case 'request_clarification':
      newDraft.status = 'needs_clarification'
      newDraft.previewDecision = 'needs_clarification'
      break
    case 'mark_block_accepted':
      if (decision.targetId) {
        newDraft.blockDecisions = newDraft.blockDecisions.filter(d => d.blockId !== decision.targetId)
        newDraft.blockDecisions.push({ blockId: decision.targetId, decision: 'accepted_in_principle', createdAt: now })
      }
      break
    case 'mark_block_needs_review':
      if (decision.targetId) {
        newDraft.blockDecisions = newDraft.blockDecisions.filter(d => d.blockId !== decision.targetId)
        newDraft.blockDecisions.push({ blockId: decision.targetId, decision: 'needs_review', createdAt: now })
      }
      break
    case 'mark_block_rejected':
      if (decision.targetId) {
        newDraft.blockDecisions = newDraft.blockDecisions.filter(d => d.blockId !== decision.targetId)
        newDraft.blockDecisions.push({ blockId: decision.targetId, decision: 'rejected', createdAt: now })
      }
      break
    case 'mark_day_needs_review':
      if (decision.targetId) {
        newDraft.dayDecisions = newDraft.dayDecisions.filter(d => d.date !== decision.targetId)
        newDraft.dayDecisions.push({ date: decision.targetId, decision: 'needs_review', createdAt: now })
      }
      break
  }

  // Point 14 — Types littéraux false : une approbation en principe ne donne jamais
  // le droit d'appliquer quoi que ce soit. Pas de booléen variable.
  newDraft.canCreateSessions = false
  newDraft.canStartSessions = false
  newDraft.canApplyPlanning = false
  newDraft.canApplyBlocking = false
  newDraft.canCompleteTasks = false
  newDraft.canPersistReview = false
  newDraft.canProceedToActivationBridge = false

  return newDraft
}
