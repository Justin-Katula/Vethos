import { useMemo } from 'react'
import type { ExecutionPreviewPlanV2 } from '@shared/execution-preview-model'
import { ExecutionPreviewUiFlags } from '@shared/execution-preview-ui-flags'
import { buildExecutionPreviewViewModel } from '../../lib/execution-preview-view-model'
import { buildExecutionPreviewEmptyState } from '../../lib/execution-preview-empty-state'
import { guardExecutionPreviewActions } from '../../lib/execution-preview-ui-guards'

import { ExecutionPreviewReadinessBanner } from './ExecutionPreviewReadinessBanner'
import { ExecutionPreviewSafetyBanner } from './ExecutionPreviewSafetyBanner'
import { ExecutionPreviewWarningList } from './ExecutionPreviewWarningList'
import { ExecutionPreviewDayCard } from './ExecutionPreviewDayCard'
import { ExecutionPreviewDiagnosticsPanel } from './ExecutionPreviewDiagnosticsPanel'
import { ExecutionPreviewActions } from './ExecutionPreviewActions'
import { AlertTriangle, Clock, ShieldX, Info } from 'lucide-react'
import { cn } from '@/lib/cn'

export interface ExecutionPreviewPanelProps {
  previewPlan?: ExecutionPreviewPlanV2
  debugMode?: boolean
}

export function ExecutionPreviewPanel({ previewPlan, debugMode = false }: ExecutionPreviewPanelProps) {
  const { vm, guardResult, emptyState } = useMemo(() => {
    // 1. Build View Model
    const viewModel = buildExecutionPreviewViewModel({ previewPlan })
    
    // 2. Guard
    const guard = guardExecutionPreviewActions(viewModel)
    
    // 3. Resolve Empty State if needed
    let empty = null
    if (!ExecutionPreviewUiFlags.executionPreviewUiEnabled) {
      empty = buildExecutionPreviewEmptyState('unsafe_preview')
    } else if (!guard.safe) {
      empty = buildExecutionPreviewEmptyState('unsafe_preview')
    } else if (!viewModel.hasPreview) {
      empty = buildExecutionPreviewEmptyState('no_preview_built')
    }
    
    return { vm: viewModel, guardResult: guard, emptyState: empty }
  }, [previewPlan])

  if (emptyState) {
    const Icon = emptyState.icon === 'error' ? ShieldX : emptyState.icon === 'warning' ? AlertTriangle : Info
    const color = emptyState.icon === 'error' ? 'text-red-400' : emptyState.icon === 'warning' ? 'text-yellow-400' : 'text-blue-400'
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center bg-bg-base border border-border-subtle rounded-xl shadow-sm">
        <Icon size={48} className={cn("mb-4 opacity-80", color)} />
        <h3 className="text-lg font-semibold text-text-primary mb-2">{emptyState.title}</h3>
        <p className="text-sm text-text-muted max-w-md">{emptyState.description}</p>
        
        {!guardResult.safe && (
          <div className="mt-6 text-left w-full rounded-md bg-red-500/10 border border-red-500/20 p-4">
            <div className="text-sm font-semibold text-red-300 mb-2">Gardes de sécurité échouées :</div>
            <ul className="list-disc pl-4 text-xs text-red-200">
              {guardResult.issues.map((i, idx) => (
                <li key={idx}>[{i.id}] {i.message}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    )
  }

  const showDiagnostics = debugMode && ExecutionPreviewUiFlags.executionPreviewDiagnosticsPanelEnabled

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold text-text-primary">{vm.title}</h2>
        <p className="text-sm text-text-muted">{vm.subtitle}</p>
      </div>

      <ExecutionPreviewReadinessBanner status={vm.status} />

      {(vm.status === 'unsafe' || vm.status === 'manual_review' || vm.status === 'warning') && (
        <ExecutionPreviewSafetyBanner 
          status={vm.status === 'manual_review' ? 'warning' : vm.status as any} 
          reasons={vm.globalReasons} 
        />
      )}

      {vm.globalWarnings.length > 0 && (
        <ExecutionPreviewWarningList warnings={vm.globalWarnings} />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {vm.summaryCards.map((card, i) => (
          <div key={i} className="flex flex-col gap-1 p-4 rounded-xl border border-border-subtle bg-bg-base shadow-sm">
            <span className="text-xs text-text-muted uppercase tracking-wider font-medium">{card.label}</span>
            <span className={cn(
              "text-2xl font-bold",
              card.severity === 'good' ? 'text-emerald-400' :
              card.severity === 'warning' ? 'text-yellow-400' :
              card.severity === 'critical' ? 'text-red-400' : 'text-text-primary'
            )}>{card.value}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-4">
        {vm.days.map((day, i) => (
          <ExecutionPreviewDayCard key={i} day={day} />
        ))}
      </div>

      {ExecutionPreviewUiFlags.executionPreviewActionsEnabled && (
        <ExecutionPreviewActions actions={vm.actions} />
      )}

      {showDiagnostics && (
        <ExecutionPreviewDiagnosticsPanel debug={vm.debug} diagnosticsSummary={vm.diagnosticsSummary} />
      )}
    </div>
  )
}
