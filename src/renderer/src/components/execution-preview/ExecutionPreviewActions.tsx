import { Button } from '@/components/ui/Button'
import type { ExecutionPreviewActionViewModel } from '../../lib/execution-preview-view-model'
import { Info } from 'lucide-react'

export function ExecutionPreviewActions({ actions }: { actions: ExecutionPreviewActionViewModel[] }) {
  if (actions.length === 0) return null

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border-subtle bg-bg-base p-5">
      <div className="text-sm font-medium text-text-primary mb-2">Actions disponibles</div>
      
      <div className="flex flex-wrap gap-3">
        {actions.map((action, i) => {
          // Strictly no handlers for apply/start/block
          const isDangerous = ['disabled_apply', 'disabled_start_session', 'disabled_blocking'].includes(action.actionType)
          
          const isDisabled = !action.enabled || isDangerous
          
          return (
            <div key={i} className="flex flex-col gap-1">
              <Button
                type="button"
                variant={isDangerous ? 'solid' : 'default'}
                disabled={isDisabled}
                className={isDangerous && isDisabled ? 'opacity-50 cursor-not-allowed' : ''}
              >
                {action.label}
              </Button>
              {action.reason && (
                <div className="flex items-start gap-1 text-[10px] text-text-muted max-w-xs">
                  <Info size={10} className="mt-0.5 shrink-0" />
                  <span>{action.reason}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
