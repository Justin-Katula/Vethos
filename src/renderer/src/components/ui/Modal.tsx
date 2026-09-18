import { useEffect, useId } from 'react'
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
  const titleId = useId()
  const descriptionId = useId()

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
          className="fixed inset-0 z-[200] flex items-center justify-center bg-scrim p-8"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose()
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.99 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-lg rounded border border-line bg-surface shadow-lift-high"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
          >
            <header className="flex items-start gap-4 border-b border-line px-7 py-5">
              <div className="flex-1">
                <h2 id={titleId} className="text-[17px] font-semibold text-fg">
                  {title}
                </h2>
                {description && (
                  <p id={descriptionId} className="mt-1.5 text-[12.5px] leading-relaxed text-fg-3">
                    {description}
                  </p>
                )}
              </div>
              {/* Une pastille ronde, comme les contrôles des overlays : le même
                  geste doit avoir la même forme partout. */}
              <button
                type="button"
                onClick={onClose}
                className="pressable -mr-1.5 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded text-fg-3 transition-colors hover:bg-surface-2 hover:text-fg"
                aria-label="Fermer"
              >
                <X size={16} />
              </button>
            </header>
            <div className="px-7 py-6">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
