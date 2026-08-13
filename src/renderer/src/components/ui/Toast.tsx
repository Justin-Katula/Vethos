import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, Info, AlertCircle, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useToastStore, type Toast as ToastType } from '@/store/toast.store'

const AUTO_DISMISS_MS = 4000

const ICON: Record<ToastType['variant'], typeof CheckCircle2> = {
  success: CheckCircle2,
  info: Info,
  error: AlertCircle,
}

// Une réussite n'a pas besoin de couleur : elle n'appelle aucune action.
// Seule l'erreur en porte une — c'est à cela qu'elle sert.
const STYLES: Record<ToastType['variant'], { bg: string; ring: string; icon: string }> = {
  success: {
    bg: 'bg-surface-2',
    ring: 'ring-accent/40',
    icon: 'text-fg',
  },
  info: {
    bg: 'bg-surface-2',
    ring: 'ring-accent/40',
    icon: 'text-fg',
  },
  error: {
    bg: 'bg-accent/10',
    ring: 'ring-accent/30',
    icon: 'text-accent',
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
        'pointer-events-auto flex w-80 items-start gap-3 rounded border border-line px-4 py-3 ring-1 backdrop-blur-md',
        style.bg,
        style.ring,
      )}
    >
      <Icon size={18} className={cn('mt-0.5 shrink-0', style.icon)} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-fg">{toast.title}</div>
        {toast.description && <div className="mt-0.5 text-xs text-fg-2">{toast.description}</div>}
      </div>
      <button
        type="button"
        onClick={() => dismiss(toast.id)}
        className="shrink-0 rounded p-1 text-fg-3 transition-colors hover:bg-surface hover:text-fg"
        aria-label="Fermer"
      >
        <X size={14} />
      </button>
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
