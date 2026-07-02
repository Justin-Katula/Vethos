import { ActivationPreconditionChecklist, ActivationPrecondition, ActivationFutureActionDraft } from '../../../shared/activation-bridge-model'
import { ExecutionPreviewPlanV2 } from '../../../shared/execution-preview-model'
import { ExecutionPreviewQaReport } from '../../../shared/execution-preview-qa-model'
import { ManualReviewDraftV2, ManualReviewGateResult } from '../../../shared/manual-review-gate-model'

export interface PreconditionChecklistInput {
  previewPlan?: ExecutionPreviewPlanV2
  qaReport?: ExecutionPreviewQaReport
  manualReviewDraft?: ManualReviewDraftV2
  manualReviewGateResult?: ManualReviewGateResult
  futureActions?: ActivationFutureActionDraft[]
  idFactory?: () => string
}

export function buildActivationPreconditionChecklist(input: PreconditionChecklistInput): ActivationPreconditionChecklist {
  const { previewPlan, qaReport, manualReviewDraft, manualReviewGateResult, futureActions = [] } = input
  const generateId = input.idFactory || (() => `precond-${Date.now()}-${Math.floor(Math.random() * 1000)}`)

  const items: ActivationPrecondition[] = []

  // 1. Preview checks
  items.push({
    id: generateId(),
    label: 'Prévisualisation existe',
    category: 'preview',
    status: previewPlan ? 'passed' : 'failed',
    severity: 'critical',
    reason: previewPlan ? 'Plan fourni.' : 'Aucun plan.',
    requiredForFutureActivation: true,
    confidence: 1
  })

  if (previewPlan) {
    items.push({
      id: generateId(),
      label: 'Prévisualisation est sécurisée',
      category: 'safety',
      status: (previewPlan.safety.status !== 'critical' && previewPlan.safety.status !== 'unsafe') ? 'passed' : 'failed',
      severity: 'critical',
      reason: previewPlan.safety.status,
      requiredForFutureActivation: true,
      confidence: 1
    })
    
    items.push({
      id: generateId(),
      label: 'Readiness Gate autorise la prévisualisation',
      category: 'preview',
      status: (previewPlan.readiness.readiness !== 'unsafe' && previewPlan.readiness.readiness !== 'blocked') ? 'passed' : 'failed',
      severity: 'critical',
      reason: previewPlan.readiness.readiness,
      requiredForFutureActivation: true,
      confidence: 1
    })

    const allBlocks = previewPlan.days?.flatMap(d => d.blocks) || []
    const invalidBlocks = allBlocks.filter(b => b.durationMinutes <= 0)
    items.push({
      id: generateId(),
      label: 'Blocs ont une durée valide',
      category: 'data',
      status: invalidBlocks.length === 0 ? 'passed' : 'failed',
      severity: 'high',
      reason: invalidBlocks.length === 0 ? 'Toutes les durées > 0' : `${invalidBlocks.length} bloc(s) avec durée <= 0`,
      requiredForFutureActivation: true,
      confidence: 1
    })

    // userId presence check
    items.push({
      id: generateId(),
      label: 'Identifiant utilisateur présent',
      category: 'data',
      status: previewPlan.userId ? 'passed' : 'warning',
      severity: 'medium',
      reason: previewPlan.userId ? 'UserId identifié' : 'Absence de UserId dans le contexte, fallback local possible',
      requiredForFutureActivation: false, // fallback local often allows running without explicit online userId
      confidence: 1
    })
  }

  // 2. QA Checks
  items.push({
    id: generateId(),
    label: 'Rapport Qualité (QA) existe',
    category: 'qa',
    status: qaReport ? 'passed' : 'failed',
    severity: 'critical',
    reason: qaReport ? 'QA fourni.' : 'Aucun QA.',
    requiredForFutureActivation: true,
    confidence: 1
  })

  if (qaReport) {
    items.push({
      id: generateId(),
      label: 'QA Status sain',
      category: 'qa',
      status: (qaReport.status !== 'unsafe' && qaReport.status !== 'invalid') ? 'passed' : 'failed',
      severity: 'critical',
      reason: qaReport.status,
      requiredForFutureActivation: true,
      confidence: 1
    })
    
    items.push({
      id: generateId(),
      label: 'Aucun droit d\'activation anticipé via QA',
      category: 'permissions',
      status: qaReport.canProceedToActivationPlanning === false ? 'passed' : 'failed',
      severity: 'critical',
      reason: qaReport.canProceedToActivationPlanning ? 'QA donne dangereusement le droit.' : 'QA verrouillé à false.',
      requiredForFutureActivation: true,
      confidence: 1
    })
  }

  // 3. Manual Review Checks
  items.push({
    id: generateId(),
    label: 'Revue Manuelle Locale',
    category: 'manual_review',
    status: manualReviewDraft ? 'passed' : 'failed',
    severity: 'critical',
    reason: manualReviewDraft ? 'Draft local présent.' : 'Manquant.',
    requiredForFutureActivation: true,
    confidence: 1
  })

  if (manualReviewDraft && manualReviewGateResult) {
    const isApproved = manualReviewDraft.previewDecision === 'accepted_in_principle'
    items.push({
      id: generateId(),
      label: 'Approbation en principe validée',
      category: 'manual_review',
      status: isApproved ? 'passed' : 'failed',
      severity: 'critical',
      reason: isApproved ? 'Utilisateur a cliqué approuver' : 'En attente ou rejeté',
      requiredForFutureActivation: true,
      confidence: 1
    })

    items.push({
      id: generateId(),
      label: 'Gate review ne force pas l\'activation',
      category: 'permissions',
      status: manualReviewGateResult.canProceedToActivationBridge === false ? 'passed' : 'failed',
      severity: 'critical',
      reason: manualReviewGateResult.canProceedToActivationBridge ? 'Fail: Gate autorise la suite' : 'Gate verrouillée.',
      requiredForFutureActivation: true,
      confidence: 1
    })
  }

  // 4. Future Actions Checks
  const executableActions = futureActions.filter(a => a.canExecuteNow)
  items.push({
    id: generateId(),
    label: 'Actions futures verrouillées',
    category: 'permissions',
    status: executableActions.length === 0 ? 'passed' : 'failed',
    severity: 'critical',
    reason: executableActions.length === 0 ? 'Toutes bloquées.' : `${executableActions.length} action(s) exécutable(s) en direct !`,
    requiredForFutureActivation: true,
    confidence: 1
  })

  const badLabels = futureActions.filter(a => /\b(apply|start|block)\b/i.test(a.label) && a.status === 'blocked') // The label shouldn't say "Apply plan" imperatively
  items.push({
    id: generateId(),
    label: 'Wording actions non-exécutif',
    category: 'ui',
    status: badLabels.length === 0 ? 'passed' : 'warning',
    severity: 'medium',
    reason: badLabels.length === 0 ? 'Descriptions neutres.' : `${badLabels.length} actions ont un vocabulaire suspect.`,
    requiredForFutureActivation: false,
    confidence: 1
  })

  const passedCount = items.filter(i => i.status === 'passed').length
  const warningCount = items.filter(i => i.status === 'warning').length
  const failedCount = items.filter(i => i.status === 'failed').length
  const blockedCount = items.filter(i => i.status === 'blocked').length

  let status: ActivationPreconditionChecklist['status'] = 'invalid'
  if (failedCount > 0 || blockedCount > 0) {
    status = 'blocked'
  } else if (warningCount > 0) {
    status = 'warnings_for_draft_only'
  } else {
    status = 'all_passed_for_draft_only'
  }

  return {
    status,
    items,
    passedCount,
    warningCount,
    failedCount,
    blockedCount,
    canActivateNow: false,
    confidence: 1
  }
}
