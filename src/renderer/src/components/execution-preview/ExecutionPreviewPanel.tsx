import { useMemo } from 'react'
import { AlertTriangle, Info, ShieldX } from 'lucide-react'
import type { ExecutionPreviewPlanV2 } from '@shared/execution-preview-model'
import { ExecutionPreviewUiFlags } from '@shared/execution-preview-ui-flags'
import { cn } from '@/lib/cn'
import { buildExecutionPreviewViewModel } from '../../lib/execution-preview-view-model'
import { buildExecutionPreviewEmptyState, type EmptyStateReason } from '../../lib/execution-preview-empty-state'
import { guardExecutionPreviewActions } from '../../lib/execution-preview-ui-guards'
import { ExecutionPreviewReadinessBanner } from './ExecutionPreviewReadinessBanner'
import { ExecutionPreviewSafetyBanner } from './ExecutionPreviewSafetyBanner'
import { ExecutionPreviewWarningList } from './ExecutionPreviewWarningList'
import { ExecutionPreviewDayCard } from './ExecutionPreviewDayCard'
import { ExecutionPreviewDiagnosticsPanel } from './ExecutionPreviewDiagnosticsPanel'
import { ExecutionPreviewActions } from './ExecutionPreviewActions'

export interface ExecutionPreviewPanelProps {
  previewPlan?: ExecutionPreviewPlanV2
  uiData?: unknown
  debug?: boolean
}

export function ExecutionPreviewPanel({ previewPlan, uiData, debug = false }: ExecutionPreviewPanelProps) {
  const { viewModel, guardResult, emptyState } = useMemo(() => {
    const vm = buildExecutionPreviewViewModel({ previewPlan, uiData })
    const guard = guardExecutionPreviewActions(vm)
    if (!ExecutionPreviewUiFlags.executionPreviewUiEnabled || !guard.safe) {
      return { viewModel: vm, guardResult: guard, emptyState: buildExecutionPreviewEmptyState('unsafe_preview') }
    }
    if (!vm.hasPreview) {
      return { viewModel: vm, guardResult: guard, emptyState: buildExecutionPreviewEmptyState(readEmptyStateReason(uiData)) }
    }
    return { viewModel: vm, guardResult: guard, emptyState: undefined }
  }, [previewPlan, uiData])

  if (emptyState) {
    const Icon = emptyState.icon === 'error' ? ShieldX : emptyState.icon === 'warning' ? AlertTriangle : Info
    const color = emptyState.icon === 'error' ? 'text-red-400' : emptyState.icon === 'warning' ? 'text-yellow-400' : 'text-blue-400'
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-border-subtle bg-bg-base p-8 text-center shadow-sm">
        <Icon size={48} className={cn('mb-4 opacity-80', color)} />
        <h3 className="mb-2 text-lg font-semibold text-text-primary">{emptyState.title}</h3>
        <p className="max-w-md text-sm text-text-muted">{emptyState.description}</p>
        {!guardResult.safe && (
          <div className="mt-6 w-full rounded-md border border-red-500/20 bg-red-500/10 p-4 text-left">
            <div className="mb-2 text-sm font-semibold text-red-300">Gardes de sécurité échouées :</div>
            <ul className="list-disc pl-4 text-xs text-red-200">
              {guardResult.issues.map((issue) => <li key={issue.id}>[{issue.id}] {issue.message}</li>)}
            </ul>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold text-text-primary">{viewModel.title}</h2>
        <p className="text-sm text-text-muted">{viewModel.subtitle}</p>
      </div>
      <ExecutionPreviewReadinessBanner status={previewPlan!.readiness.readiness} blockers={previewPlan!.readiness.blockers} warnings={previewPlan!.readiness.warnings} />
      <ExecutionPreviewSafetyBanner status={previewPlan!.safety.status} reasons={previewPlan!.safety.reasons} warnings={previewPlan!.safety.warnings} />
      <ExecutionPreviewWarningList warnings={viewModel.globalWarnings} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {viewModel.summaryCards.map((card) => (
          <div key={card.label} className="flex flex-col gap-1 rounded-xl border border-border-subtle bg-bg-base p-4 shadow-sm">
            <span className="text-xs font-medium uppercase tracking-wider text-text-muted">{card.label}</span>
            <span className={cn('text-2xl font-bold', card.severity === 'good' ? 'text-emerald-400' : card.severity === 'warning' ? 'text-yellow-400' : card.severity === 'critical' ? 'text-red-400' : 'text-text-primary')}>{card.value}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-4">{viewModel.days.map((day) => <ExecutionPreviewDayCard key={day.date} day={day} />)}</div>
      {ExecutionPreviewUiFlags.executionPreviewActionsEnabled && <ExecutionPreviewActions actions={viewModel.actions} />}
      {debug && ExecutionPreviewUiFlags.executionPreviewDiagnosticsPanelEnabled && (
        <ExecutionPreviewDiagnosticsPanel diagnostics={viewModel.diagnostics} pipelineTrace={viewModel.pipelineTrace} />
      )}
    </div>
  )
}

const emptyStateReasons: ReadonlySet<EmptyStateReason> = new Set([
  'no_preview_built', 'missing_planning_context', 'missing_placement_plan', 'missing_session_plans',
  'unsafe_preview', 'manual_review_required', 'invalid_date_range',
])

function readEmptyStateReason(uiData: unknown): EmptyStateReason {
  if (!uiData || typeof uiData !== 'object') return 'no_preview_built'
  const reason = (uiData as Record<string, unknown>).emptyStateReason
  return typeof reason === 'string' && emptyStateReasons.has(reason as EmptyStateReason)
    ? reason as EmptyStateReason
    : 'no_preview_built'
}
