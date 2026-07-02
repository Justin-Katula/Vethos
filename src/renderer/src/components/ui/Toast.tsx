import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, Info, AlertCircle, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useToastStore, type Toast as ToastType } from '@/store/toast.store'
import { Button } from '@/components/ui/Button'

const AUTO_DISMISS_MS = 4000

const ICON: Record<ToastType['variant'], typeof CheckCircle2> = {
  success: CheckCircle2,
  info: Info,
  error: AlertCircle,
}

const STYLES: Record<ToastType['variant'], { bg: string; ring: string; icon: string }> = {
  success: {
    bg: 'bg-emerald-500/10',
    ring: 'ring-emerald-500/30',
    icon: 'text-emerald-300',
  },
  info: {
    bg: 'bg-accent/10',
    ring: 'ring-accent/30',
    icon: 'text-accent',
  },
  error: {
    bg: 'bg-red-500/10',
    ring: 'ring-red-500/30',
    icon: 'text-red-300',
  },
}

function ToastItem({ toast }: { toast: ToastType }): JSX.Element {
  const dismiss = useToastStore((s) => s.dismiss)
  const Icon = ICON[toast.variant]
  const style = STYLES[toast.variant]

  useEffect(() => {
    const t = setTimeout(() => dismiss(toast.id), AUTO_DISMISS_MS)
    return () => clearTimeout(t)
  }, [toast.id, dismiss])

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 40, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40, scale: 0.95, transition: { duration: 0.2 } }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'pointer-events-auto flex w-80 items-start gap-3 rounded-lg border border-border-subtle px-4 py-3 shadow-card ring-1 backdrop-blur-md',
        style.bg,
        style.ring,
      )}
    >
      <Icon size={18} className={cn('mt-0.5 shrink-0', style.icon)} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-text-primary">{toast.title}</div>
        {toast.description && (
          <div className="mt-0.5 text-xs text-text-secondary">{toast.description}</div>
        )}
      </div>
      <Button
        type="button"
        onClick={() => dismiss(toast.id)}
        variant="ghost"
        size="sm"
        className="h-7 w-7 shrink-0 rounded-md p-0 shadow-none hover:-translate-y-0"
        aria-label="Fermer"
      >
        <X size={14} />
      </Button>
    </motion.div>
  )
}

export function ToastViewport(): JSX.Element {
  const toasts = useToastStore((s) => s.toasts)
  return (
    <div className="pointer-events-none fixed right-4 top-12 z-[200] flex flex-col items-end gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} />
        ))}
      </AnimatePresence>
    </div>
  )
}
