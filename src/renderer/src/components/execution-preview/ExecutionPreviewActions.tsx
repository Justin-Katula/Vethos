import { Info } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { ExecutionPreviewActionViewModel } from '../../lib/execution-preview-view-model'

const dangerousTypes = new Set(['disabled_apply', 'disabled_start_session', 'disabled_blocking'])

export function ExecutionPreviewActions({ actions }: { actions: ExecutionPreviewActionViewModel[] }) {
  if (actions.length === 0) return null
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border-subtle bg-bg-base p-5">
      <div className="mb-2 text-sm font-medium text-text-primary">Actions informatives</div>
      <div className="flex flex-wrap gap-3">
        {actions.map((action) => {
          const dangerous = dangerousTypes.has(action.actionType)
          return (
            <div key={action.actionType} className="flex flex-col gap-1">
              {dangerous ? (
                <Button type="button" variant="solid" disabled className="cursor-not-allowed opacity-50">{action.label}</Button>
              ) : (
                <Button type="button" variant="default" disabled={!action.enabled}>{action.label}</Button>
              )}
              <div className="flex max-w-xs items-start gap-1 text-[10px] text-text-muted"><Info size={10} className="mt-0.5 shrink-0" /><span>{action.reason}</span></div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
