import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'

/**
 * Une section repliée par défaut.
 *
 * L'en-tête porte déjà la réponse — « 3 tâches ouvertes », « 6 h 40
 * disponibles ». On ne l'ouvre que si on veut le détail. Tout afficher d'un
 * coup, ce n'est pas informer, c'est se décharger sur le lecteur.
 */
export function Disclosure({
  title,
  summary,
  defaultOpen = false,
  tone = 'neutral',
  children,
}: {
  title: string
  summary?: string
  defaultOpen?: boolean
  tone?: 'neutral' | 'danger'
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section
      className={cn(
        'info-panel rounded-lg',
        tone === 'danger' && 'border-danger/35',
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left"
      >
        <ChevronRight
          size={15}
          className={cn(
            'shrink-0 text-text-muted transition-transform duration-200',
            open && 'rotate-90',
          )}
        />
        <span
          className={cn(
            'text-sm font-medium',
            tone === 'danger' ? 'text-danger' : 'text-text-primary',
          )}
        >
          {title}
        </span>
        {summary && <span className="ml-auto text-xs text-text-muted">{summary}</span>}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-border-subtle px-5 py-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
