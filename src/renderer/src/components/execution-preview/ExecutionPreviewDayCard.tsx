import { Calendar } from 'lucide-react'
import type { ExecutionPreviewDayViewModel } from '../../lib/execution-preview-view-model'
import { ExecutionPreviewBlockCard } from './ExecutionPreviewBlockCard'
import { ExecutionPreviewWarningList } from './ExecutionPreviewWarningList'
import { cn } from '@/lib/cn'

export function ExecutionPreviewDayCard({ day }: { day: ExecutionPreviewDayViewModel }) {
  const statusColor = {
    neutral: 'text-text-primary bg-bg-base border-border-subtle',
    good: 'text-emerald-200 bg-emerald-500/10 border-emerald-500/20',
    warning: 'text-yellow-200 bg-yellow-500/10 border-yellow-500/20',
    critical: 'text-red-200 bg-red-500/10 border-red-500/20',
  }[day.statusSeverity]

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border-subtle bg-bg-base p-5 shadow-sm">
      <div className="flex items-start justify-between border-b border-border-subtle pb-4">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
            <Calendar size={18} />
            {day.title}
          </h3>
          <div className="mt-2 flex items-center gap-3 text-xs text-text-muted">
            {day.summary.map((s, i) => (
              <span key={i} className="rounded bg-accent/10 px-2 py-0.5 text-accent">
                {s}
              </span>
            ))}
            <span className="font-medium opacity-70">• {day.blocks.length} blocs</span>
          </div>
        </div>
        <div className={cn('rounded-md border px-3 py-1 text-xs font-semibold uppercase tracking-wider', statusColor)}>
          {day.statusLabel}
        </div>
      </div>

      <ExecutionPreviewWarningList warnings={day.warnings} />

      {day.blocks.length === 0 ? (
        <div className="flex items-center justify-center rounded-lg border border-dashed border-border-subtle p-8 text-sm text-text-muted">
          Aucun bloc planifié pour cette journée.
        </div>
      ) : (
        <div className="grid gap-3">
          {day.blocks.map(b => (
            <ExecutionPreviewBlockCard key={b.id} block={b} />
          ))}
        </div>
      )}
    </div>
  )
}
