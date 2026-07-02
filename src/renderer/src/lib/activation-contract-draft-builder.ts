import { ExecutionContractDraftV2, ActivationFutureActionDraft } from '../../../shared/activation-bridge-model'
import { ExecutionPreviewPlanV2 } from '../../../shared/execution-preview-model'
import { ExecutionPreviewQaReport } from '../../../shared/execution-preview-qa-model'
import { ManualReviewDraftV2, ManualReviewGateResult } from '../../../shared/manual-review-gate-model'

export interface ContractDraftBuilderInput {
  previewPlan?: ExecutionPreviewPlanV2
  qaReport?: ExecutionPreviewQaReport
  manualReviewDraft?: ManualReviewDraftV2
  manualReviewGateResult?: ManualReviewGateResult
  now?: string
  idFactory?: () => string
}

export function buildExecutionContractDraft(input: ContractDraftBuilderInput): ExecutionContractDraftV2 {
  const { previewPlan, qaReport, manualReviewDraft, manualReviewGateResult } = input
  const now = input.now || new Date().toISOString()
  const generateId = input.idFactory || (() => `contract-${Date.now()}-${Math.floor(Math.random() * 1000)}`)

  const draft: ExecutionContractDraftV2 = {
    id: generateId(),
    previewPlanId: previewPlan?.id,
    qaReportId: qaReport?.id,
    manualReviewDraftId: manualReviewDraft?.id,
    scope: 'unknown',
    status: 'invalid',
    approvedInPrinciple: false,
    futureActions: [],
    preconditions: {
      status: 'invalid',
      items: [],
      passedCount: 0,
      warningCount: 0,
      failedCount: 0,
      blockedCount: 0,
      canActivateNow: false,
      confidence: 1
    },
    warnings: [],
    blockers: [],
    canApplyPlanningNow: false,
    canCreateSessionsNow: false,
    canStartSessionsNow: false,
    canEnableBlockingNow: false,
    canCompleteTasksNow: false,
    canPersistContractNow: false,
    canActivateNow: false,
    metadata: {
      source: 'activation_bridge_contract_draft',
      createdAt: now,
      modelVersion: 1
    },
    confidence: 1
  }

  if (!previewPlan) {
    draft.status = 'invalid'
    draft.blockers.push('Aucune prévisualisation (previewPlan) fournie au Contract Builder.')
    return draft
  }
  
  draft.scope = 'full_preview'

  if (!qaReport) {
    draft.status = 'invalid'
    draft.blockers.push('Aucun rapport de qualité (qaReport) fourni.')
    return draft
  }

  if (!manualReviewDraft || !manualReviewGateResult) {
    draft.status = 'blocked'
    draft.blockers.push('La validation humaine n\'a pas encore été effectuée ou finalisée.')
    return draft
  }

  const isApproved = manualReviewDraft.previewDecision === 'accepted_in_principle'
  draft.approvedInPrinciple = isApproved

  if (!isApproved) {
    draft.status = 'blocked'
    draft.blockers.push('La prévisualisation n\'a pas été approuvée en principe par l\'utilisateur.')
  }

  if (qaReport.status === 'unsafe' || qaReport.status === 'invalid') {
    draft.status = 'unsafe'
    draft.blockers.push(`La qualité de la prévisualisation est jugée dangereuse (${qaReport.status}).`)
  }

  if (previewPlan.safety.status === 'critical' || previewPlan.safety.status === 'unsafe') {
    draft.status = 'unsafe'
    draft.blockers.push('Le rapport de sécurité initial (safetyReport) signale un état critique.')
  }

  // Generate descriptive future actions based on the preview
  if (previewPlan.days && previewPlan.days.length > 0) {
    const actionApply: ActivationFutureActionDraft = {
      id: generateId() + '-action-apply',
      kind: 'future_apply_planning',
      targetType: 'preview',
      targetId: previewPlan.id,
      label: 'Future planning application would write tasks and schedules to stores',
      status: 'blocked',
      reason: 'Application logic is deferred until real activation protocol is ready',
      canExecuteNow: false,
      requiredFutureFlags: ['canApplyPlanning'],
      requiredSafetyChecks: ['safe_for_activation'],
      confidence: 1
    }
    draft.futureActions.push(actionApply)
  }

  const allBlocks = previewPlan.days?.flatMap(d => d.blocks) || []
  if (allBlocks.length > 0) {
    const actionSession: ActivationFutureActionDraft = {
      id: generateId() + '-action-session',
      kind: 'future_create_session',
      targetType: 'session',
      label: 'Future session creation would spawn background timers and prepare locks',
      status: 'blocked',
      reason: 'Session creation is blocked by draft-only gate',
      canExecuteNow: false,
      requiredFutureFlags: ['canCreateSessions'],
      requiredSafetyChecks: ['safe_for_session'],
      confidence: 1
    }
    draft.futureActions.push(actionSession)
  }

  if (draft.blockers.length === 0) {
    if (qaReport.status === 'usable_with_warnings' || manualReviewGateResult.status === 'review_allowed_with_warnings') {
      draft.status = 'draft_with_warnings'
    } else {
      draft.status = 'draft_only'
    }
  }

  return draft
}
