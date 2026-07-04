import { AlertCircle, AlertTriangle, CheckCircle2, Terminal } from 'lucide-react'
import type { ExecutionPreviewDiagnostics, PreviewPipelineTrace } from '@shared/execution-preview-model'
import { cn } from '@/lib/cn'

export function ExecutionPreviewDiagnosticsPanel({ diagnostics, pipelineTrace }: {
  diagnostics?: ExecutionPreviewDiagnostics
  pipelineTrace?: PreviewPipelineTrace
}) {
  if (!diagnostics && !pipelineTrace) return null
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border-subtle bg-bg-base p-4 text-xs font-mono">
      <div className="flex items-center gap-2 font-sans font-semibold uppercase tracking-wider text-text-muted"><Terminal size={14} />Diagnostics / Pipeline Trace</div>
      {pipelineTrace && (
        <div className="grid grid-cols-3 gap-3 border-b border-border-subtle pb-3">
          <div><span className="text-text-muted">Confiance :</span> <span className="text-text-primary">{pipelineTrace.confidence}%</span></div>
          <div><span className="text-text-muted">Étapes échouées :</span> <span className="text-text-primary">{pipelineTrace.failedStepIds.length}</span></div>
          <div><span className="text-text-muted">Étapes en alerte :</span> <span className="text-text-primary">{pipelineTrace.warningStepIds.length}</span></div>
        </div>
      )}
      {diagnostics && (
        <div className="space-y-2">
          <div className="text-text-muted">Issues ({diagnostics.status}) :</div>
          {diagnostics.issues.length === 0 ? <div className="italic text-text-muted">Aucun problème détecté.</div> : diagnostics.issues.map((issue) => (
            <div key={issue.id} className="rounded bg-bg-card-hover px-3 py-2">
              <div className="flex items-center justify-between gap-3"><span className="text-text-primary">{issue.message}</span><span className="uppercase text-orange-300">{issue.severity}</span></div>
              {issue.suggestion && <div className="mt-1 text-[10px] text-text-muted">{issue.suggestion}</div>}
            </div>
          ))}
          {diagnostics.summary.map((item) => <div key={item} className="text-text-muted">{item}</div>)}
        </div>
      )}
      {pipelineTrace && (
        <div className="space-y-2">
          <div className="text-text-muted">Étapes du pipeline :</div>
          {pipelineTrace.steps.map((step) => {
            const error = step.status === 'failed'
            const warning = step.status === 'success_with_warnings' || step.status === 'manual_review_required'
            return (
              <div key={step.id} className="rounded bg-bg-card-hover px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-text-primary">{step.name}</span>
                  <span className={cn('flex items-center gap-1', error ? 'text-red-400' : warning ? 'text-yellow-400' : 'text-emerald-400')}>
                    {error ? <AlertCircle size={12} /> : warning ? <AlertTriangle size={12} /> : <CheckCircle2 size={12} />}{step.status}
                  </span>
                </div>
                <div className="mt-1 text-[10px] text-text-muted">{step.reason}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
