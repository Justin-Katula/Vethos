import { ManualReviewDraftV2, ManualReviewGateResult, ManualReviewDiagnostics, ManualReviewExplanation, ManualReviewDecisionKind } from '../../../shared/manual-review-gate-model'

export interface ManualReviewViewModelInput {
  draft?: ManualReviewDraftV2
  gateResult?: ManualReviewGateResult
  diagnostics?: ManualReviewDiagnostics
  explanation?: ManualReviewExplanation
  previewPlan?: any
  qaReport?: any
}

export interface ManualReviewViewModel {
  gateResult?: ManualReviewGateResult
  statusLabel: string
  statusSeverity: 'neutral' | 'good' | 'warning' | 'critical'
  
  summaryCards: Array<{
    label: string
    value: string
    severity: 'neutral' | 'good' | 'warning' | 'critical'
  }>

  blockRows: Array<{
    blockId: string
    title: string
    timeLabel: string
    decisionLabel: string
    decisionSeverity: 'neutral' | 'good' | 'warning' | 'critical'
  }>

  actions: Array<{
    label: string
    actionType: ManualReviewDecisionKind
    targetType: 'preview' | 'day' | 'block' | 'qa' | 'safety' | 'readiness'
    targetId?: string
    enabled: boolean
    dangerous: false // ALWAYS FALSE
    reason: string
  }>

  warnings: string[]
  blockers: string[]

  canApplyAnything: false // ALWAYS FALSE
  canProceedToActivationBridge: false // ALWAYS FALSE
}

export function buildManualReviewViewModel(input: ManualReviewViewModelInput): ManualReviewViewModel {
  const { draft, gateResult, diagnostics, explanation, previewPlan } = input

  let statusLabel = 'Inconnu'
  let statusSeverity: 'neutral' | 'good' | 'warning' | 'critical' = 'neutral'

  if (gateResult?.status === 'safety_blocked') {
    statusLabel = 'Bloqué par la sécurité'
    statusSeverity = 'critical'
  } else if (draft?.status === 'approved_in_principle') {
    statusLabel = 'Approuvé (en principe)'
    statusSeverity = 'good'
  } else if (draft?.status === 'changes_requested') {
    statusLabel = 'Modifications demandées'
    statusSeverity = 'warning'
  } else if (draft?.status === 'rejected') {
    statusLabel = 'Rejeté'
    statusSeverity = 'critical'
  } else if (draft?.status === 'needs_clarification') {
    statusLabel = 'Clarification requise'
    statusSeverity = 'warning'
  } else {
    statusLabel = 'En cours d\'examen'
  }

  const summaryCards: ManualReviewViewModel['summaryCards'] = []
  if (explanation) {
    summaryCards.push({
      label: explanation.title,
      value: explanation.summary,
      severity: statusSeverity
    })
  }

  const blockRows: ManualReviewViewModel['blockRows'] = []
  if (previewPlan && previewPlan.days) {
    previewPlan.days.forEach((day: any) => {
      if (day.blocks) {
        day.blocks.forEach((block: any) => {
          const decision = draft?.blockDecisions.find(d => d.blockId === block.id)
          let decisionLabel = 'Non examiné'
          let decisionSeverity: 'neutral' | 'good' | 'warning' | 'critical' = 'neutral'
          
          if (decision?.decision === 'accepted_in_principle') {
            decisionLabel = 'Accepté'
            decisionSeverity = 'good'
          } else if (decision?.decision === 'needs_review') {
            decisionLabel = 'À revoir'
            decisionSeverity = 'warning'
          } else if (decision?.decision === 'rejected') {
            decisionLabel = 'Rejeté'
            decisionSeverity = 'critical'
          }

          blockRows.push({
            blockId: block.id,
            title: block.task?.title || 'Bloc',
            timeLabel: '00:00 - 00:00', // Mocked, ideally from block data
            decisionLabel,
            decisionSeverity
          })
        })
      }
    })
  }

  const actions: ManualReviewViewModel['actions'] = []

  const isBlocked = gateResult?.status === 'safety_blocked' || gateResult?.status === 'review_blocked' || diagnostics?.status === 'critical'

  actions.push({
    label: 'Approuver en principe',
    actionType: 'approve_preview_in_principle',
    targetType: 'preview',
    enabled: !isBlocked && draft?.status !== 'approved_in_principle',
    dangerous: false,
    reason: isBlocked ? 'Review bloquée.' : ''
  })
  actions.push({
    label: 'Rejeter cette preview',
    actionType: 'reject_preview',
    targetType: 'preview',
    enabled: !isBlocked && draft?.status !== 'rejected',
    dangerous: false,
    reason: isBlocked ? 'Review bloquée.' : ''
  })
  actions.push({
    label: 'Demander des changements',
    actionType: 'request_changes',
    targetType: 'preview',
    enabled: !isBlocked && draft?.status !== 'changes_requested',
    dangerous: false,
    reason: isBlocked ? 'Review bloquée.' : ''
  })
  actions.push({
    label: 'Réinitialiser la review locale',
    actionType: 'clear_local_review',
    targetType: 'preview',
    enabled: draft?.decisions && draft.decisions.length > 0 ? true : false,
    dangerous: false,
    reason: ''
  })

  // Exclude forbidden buttons explicitly
  // apply, start session, block now, auto-fix, save/persist are completely absent.

  return {
    gateResult,
    statusLabel,
    statusSeverity,
    summaryCards,
    blockRows,
    actions,
    warnings: gateResult?.warnings || [],
    blockers: gateResult?.blockers || [],
    canApplyAnything: false,
    canProceedToActivationBridge: false
  }
}
