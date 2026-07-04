import { Clock, Layers3, Shield, PlayCircle } from 'lucide-react'
import type { ExecutionPreviewBlockViewModel } from '../../lib/execution-preview-view-model'
import { ExecutionPreviewWarningList } from './ExecutionPreviewWarningList'
import { cn } from '@/lib/cn'

export function ExecutionPreviewBlockCard({ block }: { block: ExecutionPreviewBlockViewModel }) {
  const readinessColor = {
    neutral: 'border-border-subtle bg-bg-base text-text-primary',
    good: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-200',
    warning: 'border-yellow-500/20 bg-yellow-500/5 text-yellow-200',
    critical: 'border-red-500/20 bg-red-500/5 text-red-200',
  }[block.readinessSeverity]

  return (
    <div className={cn('flex flex-col gap-3 rounded-lg border p-4 shadow-sm', readinessColor)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-semibold">{block.title}</div>
          <div className="mt-1 flex items-center gap-3 text-xs opacity-80">
            <span className="flex items-center gap-1">
              <Clock size={12} />
              {block.timeLabel} ({block.durationLabel})
            </span>
            <span className="flex items-center gap-1">
              <PlayCircle size={12} />
              {block.kindLabel}
            </span>
            {block.modeLabel && (
              <span className="flex items-center gap-1">
                <Layers3 size={12} />
                {block.modeLabel}
              </span>
            )}
            {block.protectionLabel && (
              <span className="flex items-center gap-1">
                <Shield size={12} />
                {block.protectionLabel}
              </span>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs font-medium uppercase tracking-wider opacity-90">
            {block.readinessLabel}
          </div>
          <div className="mt-0.5 text-[10px] opacity-70">
            Confiance: {block.confidenceLabel}
          </div>
        </div>
      </div>

      {block.reasons.length > 0 && (
        <ul className="list-disc pl-4 text-xs opacity-80 space-y-0.5">
          {block.reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}

      <ExecutionPreviewWarningList warnings={block.warnings} />
    </div>
  )
}
