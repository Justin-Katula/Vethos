import { ActivationBridgeSafetyReport, ExecutionContractDraftV2 } from '../../../shared/activation-bridge-model'
import { ExecutionPreviewPlanV2 } from '../../../shared/execution-preview-model'
import { ExecutionPreviewQaReport } from '../../../shared/execution-preview-qa-model'
import { ManualReviewDraftV2, ManualReviewGateResult } from '../../../shared/manual-review-gate-model'

export interface ActivationBridgeSafetyEngineInput {
  contractDraft?: ExecutionContractDraftV2
  previewPlan?: ExecutionPreviewPlanV2
  qaReport?: ExecutionPreviewQaReport
  manualReviewDraft?: ManualReviewDraftV2
  manualReviewGateResult?: ManualReviewGateResult
}

function isUnserializable(obj: any): boolean {
  try {
    JSON.stringify(obj)
    return false
  } catch (e) {
    return true
  }
}

export function runActivationBridgeSafetyCheck(input: ActivationBridgeSafetyEngineInput): ActivationBridgeSafetyReport {
  const report: ActivationBridgeSafetyReport = {
    status: 'safe_for_draft',
    dangerousPermissionDetected: false,
    unsafeReasons: [],
    warnings: [],
    canApplyAnythingNow: false,
    canActivateNow: false,
    confidence: 1
  }

  const addUnsafe = (reason: string) => {
    report.status = 'critical'
    report.dangerousPermissionDetected = true
    report.unsafeReasons.push(reason)
  }

  if (isUnserializable(input)) {
    addUnsafe('Input contient des données non sérialisables.')
  }

  // 1. Check contract
  if (input.contractDraft) {
    const { contractDraft } = input
    if (contractDraft.canApplyPlanningNow || contractDraft.canCreateSessionsNow || contractDraft.canStartSessionsNow ||
        contractDraft.canEnableBlockingNow || contractDraft.canCompleteTasksNow || contractDraft.canPersistContractNow ||
        contractDraft.canActivateNow) {
      addUnsafe('Le contrat brouillon accorde des droits d\'exécution directe (can*Now = true).')
    }

    if (contractDraft.futureActions) {
      for (const action of contractDraft.futureActions) {
        if (action.canExecuteNow) {
          addUnsafe(`L'action future "${action.id}" se déclare exécutable maintenant.`)
        }
        if (/\b(apply|start|block|activate|execute|auto-fix)\b/i.test(action.label) && action.status !== 'blocked' && action.status !== 'requires_future_permission' && action.status !== 'requires_safety_check') {
           addUnsafe(`L'action future "${action.id}" utilise un vocabulaire d'exécution sans être explicitement bloquée ou conditionnelle.`)
        }
      }
    }

    if (contractDraft.status === 'draft_only' || contractDraft.status === 'draft_with_warnings') {
      if (input.qaReport && input.qaReport.status === 'unsafe') {
        addUnsafe('Contrat déclaré "draft_ready" alors que la QA est "unsafe".')
      }
      if (input.previewPlan && input.previewPlan.safety.status === 'critical') {
        addUnsafe('Contrat déclaré "draft_ready" alors que la sécurité de la preview est "critical".')
      }
      if (input.manualReviewDraft && input.manualReviewDraft.previewDecision !== 'accepted_in_principle') {
        addUnsafe('Contrat déclaré "draft_ready" alors que la review locale n\'est pas approuvée.')
      }
    }
  }

  // 2. Check source dependencies
  if (input.previewPlan) {
    if (input.previewPlan.readiness.canApplyLater) {
      addUnsafe('Le previewPlan accorde canApplyLater = true, ce qui viole l\'isolation du bridge.')
    }
    // Check NaN/Infinity
    const str = JSON.stringify(input.previewPlan)
    if (str.includes('NaN') || str.includes('Infinity')) {
      addUnsafe('Valeurs mathématiques dangereuses détectées (NaN/Infinity) dans le previewPlan.')
    }
  }

  if (input.qaReport) {
    if (input.qaReport.canProceedToActivationPlanning) {
      addUnsafe('Le qaReport accorde canProceedToActivationPlanning = true.')
    }
  }

  if (input.manualReviewDraft && input.manualReviewDraft.canProceedToActivationBridge) {
    addUnsafe('Le manualReviewDraft force canProceedToActivationBridge = true.')
  }

  if (input.manualReviewGateResult && input.manualReviewGateResult.canProceedToActivationBridge) {
    addUnsafe('Le manualReviewGateResult force canProceedToActivationBridge = true.')
  }

  return report
}
