import React from 'react'
import { Loader2, RefreshCw, XCircle } from 'lucide-react'
import { ExecutionPreviewPanel } from './ExecutionPreviewPanel'
import { ExecutionPreviewQaPanel } from './ExecutionPreviewQaPanel'
import { ManualReviewGatePanel } from './ManualReviewGatePanel'
import { useExecutionPreviewDataProvider } from '../../hooks/useExecutionPreviewDataProvider'
import { ExecutionPreviewUiFlags } from '@shared/execution-preview-ui-flags'
import { ExecutionPreviewDataConnectorFlags } from '@shared/execution-preview-data-connector-flags'
import { Button } from '@/components/ui/Button'
import { runExecutionPreviewQa } from '@/lib/execution-preview-qa-engine'
import { executionPreviewQaFlags } from '@shared/execution-preview-qa-flags'

export function ExecutionPreviewDataConnectorPanel() {
  const { state, generatePreview, clearPreview } = useExecutionPreviewDataProvider()

  if (!ExecutionPreviewDataConnectorFlags.executionPreviewDataConnectorEnabled) return null

  const qaReport = React.useMemo(() => {
    if (!executionPreviewQaFlags.executionPreviewQaEnabled) return undefined
    if (state.status === 'idle' || state.status === 'building') return undefined
    if (!state.previewPlan && state.status !== 'failed' && state.status !== 'unsafe') return undefined
    
    return runExecutionPreviewQa({
      providerState: state,
      previewPlan: state.previewPlan,
    })
  }, [state])

  return (
    <div className="flex flex-col gap-4 border border-border-subtle rounded-xl p-4 bg-bg-base shadow-sm">
      <div className="flex items-center justify-between border-b border-border-subtle pb-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-lg font-semibold text-text-primary">Connecteur de données d’aperçu</h3>
          <p className="text-xs text-text-muted">
            Pont en lecture seule entre les données réelles et le pipeline d’aperçu V2.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {state.status !== 'idle' && (
            <Button variant="ghost" size="sm" onClick={clearPreview}>
              <XCircle size={14} className="mr-2" />
              Effacer
            </Button>
          )}
          <Button
            variant="solid"
            size="sm"
            disabled={!state.canGeneratePreview || state.status === 'building'}
            onClick={generatePreview}
          >
            {state.status === 'building' ? (
              <Loader2 size={14} className="mr-2 animate-spin" />
            ) : (
              <RefreshCw size={14} className="mr-2" />
            )}
            Générer l’aperçu V2
          </Button>
        </div>
      </div>

      {state.status === 'failed' && (
        <div className="rounded-md bg-red-500/10 border border-red-500/20 p-4">
          <div className="text-sm font-semibold text-red-400 mb-2">Échec de la génération</div>
          <ul className="list-disc pl-4 text-xs text-red-300">
            {state.errors.map((e, idx) => (
              <li key={idx}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {state.status === 'unsafe' && (
        <div className="rounded-md bg-red-500/10 border border-red-500/20 p-4">
          <div className="text-sm font-semibold text-red-400 mb-2">Génération Rejetée (Sécurité)</div>
          <ul className="list-disc pl-4 text-xs text-red-300">
            {state.errors.map((e, idx) => (
              <li key={idx}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {state.warnings.length > 0 && (
        <div className="rounded-md border border-yellow-500/20 bg-yellow-500/10 p-4">
          <div className="mb-2 text-sm font-semibold text-yellow-300">Avertissements</div>
          <ul className="list-disc space-y-1 pl-4 text-xs text-yellow-200">
            {[...new Set(state.warnings)].map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </div>
      )}

      {(state.status === 'ready' || state.status === 'ready_with_warnings' || state.status === 'partial') && (
        <div className="mt-4 flex flex-col gap-4">
          <ExecutionPreviewPanel
            previewPlan={state.previewPlan}
            debug={ExecutionPreviewUiFlags.executionPreviewDebugPanelEnabled}
          />
          {executionPreviewQaFlags.executionPreviewQaPanelEnabled && qaReport && (
            <ExecutionPreviewQaPanel qaReport={qaReport} debug={true} />
          )}

          <ManualReviewGatePanel previewPlan={state.previewPlan} qaReport={qaReport} debug={true} />
        </div>
      )}
      
      {state.status === 'idle' && (
        <div className="py-12 text-center text-sm text-text-muted">
          Cliquez sur « Générer l’aperçu V2 » pour lire l'état actuel et construire un plan V2.<br/>
          (Lecture seule garantie, aucune modification ne sera appliquée).
        </div>
      )}
    </div>
  )
}
