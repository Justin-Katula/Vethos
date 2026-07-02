import React, { useMemo } from 'react'
import { ExecutionPreviewPlanV2 } from '@shared/execution-preview-model'
import { ExecutionPreviewQaReport } from '@shared/execution-preview-qa-model'
import { ManualReviewDraftV2, ManualReviewGateResult } from '@shared/manual-review-gate-model'
import { activationBridgeFlags } from '@shared/activation-bridge-flags'
import { buildExecutionContractDraft } from '../../lib/activation-contract-draft-builder'
import { buildActivationPreconditionChecklist } from '../../lib/activation-precondition-checklist'
import { runActivationBridgeGate } from '../../lib/activation-bridge-gate-engine'
import { runActivationBridgeDiagnostics } from '../../lib/activation-bridge-diagnostics'
import { explainActivationBridge } from '../../lib/activation-bridge-explanation'
import { buildActivationBridgeViewModel } from '../../lib/activation-bridge-view-model'
import { guardActivationBridgeUi } from '../../lib/activation-bridge-ui-guards'

import { ActivationContractSummary } from './ActivationContractSummary'
import { ActivationPreconditionList } from './ActivationPreconditionList'
import { ActivationBlockedActions } from './ActivationBlockedActions'

// Real Activation imports
import { realActivationProtocolFlags } from '@shared/real-activation-protocol-flags'
import { buildRealActivationModuleAudit } from '../../lib/real-activation-module-audit'
import { buildMinimalExecutionBoundary } from '../../lib/minimal-execution-boundary-builder'
import { buildRealActivationPermissionMatrix } from '../../lib/real-activation-permission-matrix'
import { runRealActivationRiskEngine } from '../../lib/real-activation-risk-engine'
import { buildRealActivationProtocolDraft } from '../../lib/real-activation-protocol-draft-builder'
import { buildRealActivationViewModel } from '../../lib/real-activation-view-model'
import { RealActivationProtocolPanel } from './RealActivationProtocolPanel'

interface ActivationBridgePanelProps {
  previewPlan?: ExecutionPreviewPlanV2
  qaReport?: ExecutionPreviewQaReport
  manualReviewDraft?: ManualReviewDraftV2
  manualReviewGateResult?: ManualReviewGateResult
  debug?: boolean
}

export const ActivationBridgePanel: React.FC<ActivationBridgePanelProps> = ({
  previewPlan,
  qaReport,
  manualReviewDraft,
  manualReviewGateResult,
  debug
}) => {
  if (!activationBridgeFlags.activationBridgeEnabled || !activationBridgeFlags.activationBridgeUiEnabled) {
    return null
  }

  // Purely functional view model computation (no useState, no side effects)
  const viewModel = useMemo(() => {
    // 1. Build initial contract draft
    const draft = buildExecutionContractDraft({
      previewPlan,
      qaReport,
      manualReviewDraft,
      manualReviewGateResult
    })

    // 2. Build preconditions based on inputs
    const preconditions = buildActivationPreconditionChecklist({
      previewPlan,
      qaReport,
      manualReviewDraft,
      manualReviewGateResult,
      futureActions: draft.futureActions
    })
    draft.preconditions = preconditions

    // 3. Evaluate Gate
    const gateResult = runActivationBridgeGate({
      contractDraft: draft,
      previewPlan,
      qaReport,
      manualReviewDraft,
      manualReviewGateResult
    })

    // 4. Run diagnostics
    const diagnostics = runActivationBridgeDiagnostics({
      contractDraft: draft,
      gateResult,
      previewPlan,
      qaReport,
      manualReviewDraft
    })

    // 5. Build Explanation
    const explanation = explainActivationBridge({
      contractDraft: draft,
      gateResult,
      diagnostics
    })

    // 6. View Model
    const vm = buildActivationBridgeViewModel({
      contractDraft: draft,
      gateResult,
      diagnostics,
      explanation
    })

    // 7. Security guards
    const guards = guardActivationBridgeUi(vm)

    if (!guards.safe) {
      console.error('[ActivationBridgePanel] Security guards blocked UI rendering:', guards.issues)
      vm.statusSeverity = 'critical'
      vm.statusLabel = 'UI Security Block'
      vm.warnings = ['Sécurité UI compromise. Rendu bloqué.']
      vm.futureActionRows = [] // Hide everything dangerous
    }

    return vm
  }, [previewPlan, qaReport, manualReviewDraft, manualReviewGateResult])

  // Real Activation Protocol memoization
  const protocolReport = useMemo(() => {
    if (!realActivationProtocolFlags.realActivationProtocolEnabled || !realActivationProtocolFlags.realActivationUiEnabled) {
      return null
    }

    const audit = buildRealActivationModuleAudit({})
    const contractDraft = buildExecutionContractDraft({
      previewPlan,
      qaReport,
      manualReviewDraft,
      manualReviewGateResult
    })

    const boundary = buildMinimalExecutionBoundary({
      moduleAudit: audit,
      contractDraft
    })

    const permissionMatrix = buildRealActivationPermissionMatrix({
      boundary,
      moduleAudit: audit
    })

    const riskReport = runRealActivationRiskEngine({
      moduleAudit: audit
    })

    const protocolDraft = buildRealActivationProtocolDraft({
      activationBridgeDraftId: contractDraft?.id || 'bridge-draft-id',
      contractDraftId: contractDraft?.id || 'contract-draft-id',
      moduleAudit: audit,
      boundary,
      permissionMatrix,
      riskReport
    })

    return buildRealActivationViewModel({
      protocolDraft
    })
  }, [previewPlan, qaReport, manualReviewDraft, manualReviewGateResult, viewModel])

  return (
    <div className="bg-gray-900 border border-purple-800/50 p-6 rounded-lg mt-6 shadow-lg">
      <div className="border-b border-gray-800 pb-4 mb-4">
        <h2 className="text-xl font-bold text-white mb-2">Pont d'Activation (Mode Read-Only)</h2>
        <div className="bg-purple-900/30 border border-purple-800 text-purple-300 p-3 rounded text-sm">
          <strong>Notice Légale Interne :</strong> {viewModel.forbiddenActionNotice}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-6">
          <ActivationContractSummary cards={viewModel.summaryCards} />
          
          {viewModel.blockers.length > 0 && (
            <div className="bg-red-900/20 border border-red-800 p-4 rounded-lg">
              <h3 className="text-red-400 font-medium mb-2">Blocages d'Activation</h3>
              <ul className="list-disc pl-4 space-y-1">
                {viewModel.blockers.map((b, idx) => (
                  <li key={idx} className="text-red-300 text-sm">{b}</li>
                ))}
              </ul>
            </div>
          )}

          {viewModel.warnings.length > 0 && (
            <div className="bg-yellow-900/20 border border-yellow-800 p-4 rounded-lg">
              <h3 className="text-yellow-400 font-medium mb-2">Avertissements</h3>
              <ul className="list-disc pl-4 space-y-1">
                {viewModel.warnings.map((w, idx) => (
                  <li key={idx} className="text-yellow-300 text-sm">{w}</li>
                ))}
              </ul>
            </div>
          )}

          <ActivationBlockedActions actions={viewModel.futureActionRows} />
        </div>

        <div>
          <ActivationPreconditionList preconditions={viewModel.preconditionRows} />
        </div>
      </div>

      {protocolReport && (
        <div className="mt-8 border-t border-gray-800 pt-8">
          <RealActivationProtocolPanel report={protocolReport} />
        </div>
      )}
    </div>
  )
}
