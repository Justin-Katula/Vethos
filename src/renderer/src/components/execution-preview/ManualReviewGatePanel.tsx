import React, { useState, useMemo } from 'react'
import { ManualReviewDecisionKind, ManualReviewDecisionV2 } from '@shared/manual-review-gate-model'
import { buildManualReviewDraft } from '../../lib/manual-review-draft-builder'
import { applyManualReviewDecisionToDraft } from '../../lib/manual-review-decision-engine'
import { runManualReviewGate } from '../../lib/manual-review-gate-engine'
import { runManualReviewDiagnostics } from '../../lib/manual-review-diagnostics'
import { explainManualReviewGate } from '../../lib/manual-review-explanation'
import { buildManualReviewViewModel } from '../../lib/manual-review-view-model'
import { guardManualReviewUi } from '../../lib/manual-review-ui-guards'
import { manualReviewGateFlags } from '@shared/manual-review-gate-flags'
import { useSettingsStore } from '../../store/settings.store'

import { ManualReviewSummaryCard } from './ManualReviewSummaryCard'
import { ManualReviewDecisionControls } from './ManualReviewDecisionControls'
import { ManualReviewBlockReviewList } from './ManualReviewBlockReviewList'
import { ActivationBridgePanel } from './ActivationBridgePanel'

interface ManualReviewGatePanelProps {
  previewPlan?: any
  qaReport?: any
  debug?: boolean
}

export const ManualReviewGatePanel: React.FC<ManualReviewGatePanelProps> = ({ previewPlan, qaReport, debug }) => {
  if (!manualReviewGateFlags.manualReviewGateEnabled) {
    return null
  }

  const settings = useSettingsStore()

  // LOCAL STATE ONLY. NO STORE. NO LOCAL STORAGE. NO PERSISTENCE.
  const [draft, setDraft] = useState(() => buildManualReviewDraft({ previewPlan, qaReport }))

  const viewModel = useMemo(() => {
    const gateResult = runManualReviewGate({ draft, previewPlan, qaReport, settings })
    const diagnostics = runManualReviewDiagnostics({ draft, gateResult, previewPlan, qaReport })
    const explanation = explainManualReviewGate({ draft, gateResult, diagnostics })

    const vm = buildManualReviewViewModel({ draft, gateResult, diagnostics, explanation, previewPlan, qaReport })
    const guards = guardManualReviewUi(vm)

    if (!guards.safe) {
      console.error('[ManualReviewGatePanel] UI Guards blocked rendering:', guards.issues)
      // fallback to safe disabled state
      vm.actions = []
      vm.statusSeverity = 'critical'
      vm.statusLabel = 'UI Guard Error'
      vm.warnings.push('UI Security Guards prevented rendering dangerous state.')
    }

    return vm
  }, [draft, previewPlan, qaReport, settings])

  const handleDecision = (kind: ManualReviewDecisionKind, targetType: 'preview' | 'block' | 'day', targetId?: string) => {
    const decision: ManualReviewDecisionV2 = {
      id: `decision-${Date.now()}`,
      kind,
      targetType,
      targetId,
      decision: kind === 'approve_preview_in_principle' || kind === 'mark_block_accepted' ? 'accepted_in_principle' : 
                kind === 'reject_preview' || kind === 'mark_block_rejected' ? 'rejected' : 
                kind === 'request_changes' ? 'changes_requested' : 
                kind === 'clear_local_review' ? 'cleared' : 'needs_review',
      createdAt: new Date().toISOString(),
      source: 'manual_review_ui',
      canApplyDecision: false
    }
    
    // update local state immutably
    setDraft(prev => applyManualReviewDecisionToDraft({ draft: prev, decision, previewPlan, qaReport, settings }))
  }

  return (
    <div className="bg-gray-800 p-6 rounded-lg border border-gray-700 mt-4 space-y-6">
      <div className="flex justify-between items-center border-b border-gray-700 pb-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Validation Humaine</h2>
          <p className="text-sm text-gray-400 mt-1">
            Examinez la prévisualisation. <strong className="text-yellow-500">Aucune session réelle ne sera créée. L'approbation est en principe seulement.</strong>
          </p>
        </div>
        <div className={`px-3 py-1 rounded-full text-sm font-medium ${
          viewModel.statusSeverity === 'good' ? 'bg-green-900 text-green-300' :
          viewModel.statusSeverity === 'warning' ? 'bg-yellow-900 text-yellow-300' :
          viewModel.statusSeverity === 'critical' ? 'bg-red-900 text-red-300' :
          'bg-gray-700 text-gray-300'
        }`}>
          {viewModel.statusLabel}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="col-span-1 md:col-span-2 space-y-6">
          <ManualReviewBlockReviewList 
            blocks={viewModel.blockRows} 
            onDecision={handleDecision} 
          />
        </div>
        <div className="col-span-1 space-y-6">
          <ManualReviewSummaryCard cards={viewModel.summaryCards} />
          
          <ManualReviewDecisionControls 
            actions={viewModel.actions} 
            onDecision={handleDecision} 
          />

          {viewModel.warnings.length > 0 && (
            <div className="bg-yellow-900/30 border border-yellow-800 p-4 rounded-lg">
              <h4 className="text-sm font-semibold text-yellow-400 mb-2">Avertissements</h4>
              <ul className="list-disc pl-4 space-y-1">
                {viewModel.warnings.map((w, i) => (
                  <li key={i} className="text-sm text-yellow-300">{w}</li>
                ))}
              </ul>
            </div>
          )}

          {viewModel.blockers.length > 0 && (
            <div className="bg-red-900/30 border border-red-800 p-4 rounded-lg">
              <h4 className="text-sm font-semibold text-red-400 mb-2">Bloquants</h4>
              <ul className="list-disc pl-4 space-y-1">
                {viewModel.blockers.map((b, i) => (
                  <li key={i} className="text-sm text-red-300">{b}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <ActivationBridgePanel 
        previewPlan={previewPlan} 
        qaReport={qaReport} 
        manualReviewDraft={draft} 
        manualReviewGateResult={viewModel.gateResult} 
        debug={debug} 
      />
    </div>
  )
}
