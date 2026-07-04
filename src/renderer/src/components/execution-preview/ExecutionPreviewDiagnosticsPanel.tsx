import { Terminal, CheckCircle2, AlertTriangle, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/cn'

export function ExecutionPreviewDiagnosticsPanel({
  debug,
  diagnosticsSummary,
}: {
  debug?: { planId?: string; confidence?: number; pipelineSteps?: unknown[] }
  diagnosticsSummary: string[]
}) {
  if (!debug) return null

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border-subtle bg-bg-base p-4 text-xs font-mono">
      <div className="flex items-center gap-2 text-text-muted font-sans font-semibold uppercase tracking-wider">
        <Terminal size={14} />
        Diagnostics / Pipeline Trace
      </div>
      
      <div className="grid grid-cols-2 gap-4 border-b border-border-subtle pb-3">
        <div>
          <span className="text-text-muted">Plan ID:</span> <span className="text-text-primary">{debug.planId || 'N/A'}</span>
        </div>
        <div>
          <span className="text-text-muted">Confidence:</span> <span className="text-text-primary">{debug.confidence ?? 0}%</span>
        </div>
      </div>

      <div className="space-y-1">
        <div className="text-text-muted mb-2">Diagnostics Summary:</div>
        {diagnosticsSummary.length === 0 ? (
          <div className="text-text-muted italic">Aucun problème détecté.</div>
        ) : (
          <ul className="list-disc pl-4 text-orange-300">
            {diagnosticsSummary.map((d, i) => <li key={i}>{d}</li>)}
          </ul>
        )}
      </div>

      <div className="mt-2 space-y-1">
        <div className="text-text-muted mb-2">Pipeline Steps:</div>
        {(debug.pipelineSteps || []).map((step: any, i) => {
          const isError = step.status === 'failed' || step.status === 'aborted'
          const isWarn = step.status === 'warning' || step.status === 'partial'
          
          return (
            <div key={i} className="flex flex-col gap-1 rounded bg-bg-card-hover px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-text-primary">{step.stepName}</span>
                <span className={cn('flex items-center gap-1', isError ? 'text-red-400' : isWarn ? 'text-yellow-400' : 'text-emerald-400')}>
                  {isError ? <AlertCircle size={12} /> : isWarn ? <AlertTriangle size={12} /> : <CheckCircle2 size={12} />}
                  {step.status}
                </span>
              </div>
              {step.durationMs !== undefined && (
                <div className="text-[10px] text-text-muted">{step.durationMs}ms</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
