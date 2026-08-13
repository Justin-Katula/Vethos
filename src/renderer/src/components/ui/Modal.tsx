import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'

/**
 * Une fenêtre pour une seule décision.
 *
 * Les formulaires vivent ici, pas au milieu de la page : sept champs alignés
 * sous le planning, c'est sept raisons d'hésiter avant de lire le planning.
 */
export function Modal({
  open,
  title,
  description,
  onClose,
  children,
}: {
  open: boolean
  title: string
  description?: string
  onClose: () => void
  children: React.ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-8 backdrop-blur-sm"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose()
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.99 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-lg rounded border border-rail bg-panel "
          >
            <header className="flex items-start gap-4 border-b border-rail px-6 py-5">
              <div className="flex-1">
                <h2 className="text-base font-semibold text-ink">{title}</h2>
                {description && <p className="mt-1 text-xs text-ink-3">{description}</p>}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="text-ink-3 transition-colors hover:text-ink"
                aria-label="Fermer"
              >
                <X size={16} />
              </button>
            </header>
            <div className="px-6 py-5">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
