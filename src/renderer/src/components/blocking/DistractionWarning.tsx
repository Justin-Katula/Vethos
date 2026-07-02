import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/cn'

type Props = {
  open: boolean
  title: string
  message: string
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Dialog de confirmation avant une action irréversible (classification, demote).
 * Anti-sabotage : l'utilisateur doit lire le warning avant de valider (D11).
 */
export function DistractionWarning({ open, title, message, onConfirm, onCancel }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={onCancel}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="max-w-md rounded-xl border border-border-strong bg-bg-elevated p-6 shadow-elevated"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-orange/10 text-orange">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
                <p className="mt-2 text-xs text-text-secondary">{message}</p>
                <p className="mt-3 text-[10px] uppercase tracking-wider text-orange font-bold">
                  Cette action est irréversible.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="rounded-md border border-border-subtle px-3 py-1.5 text-xs text-text-secondary hover:border-border-strong transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className={cn(
                  'rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-black',
                  'hover:bg-accent-hover transition-colors',
                )}
              >
                Confirmer
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
