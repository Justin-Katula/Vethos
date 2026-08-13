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
  /** Rang dans la pile : décale l'entrée pour que les sections arrivent l'une après l'autre. */
  index = 0,
  children,
}: {
  title: string
  summary?: string
  defaultOpen?: boolean
  tone?: 'neutral' | 'danger'
  index?: number
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 + index * 0.07, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className={cn('surface rounded', tone === 'danger' && 'border-accent/35')}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left"
      >
        <ChevronRight
          size={15}
          className={cn(
            'shrink-0 text-fg-3 transition-transform duration-200',
            open && 'rotate-90',
          )}
        />
        <span className={cn('text-sm font-medium', tone === 'danger' ? 'text-accent' : 'text-fg')}>
          {title}
        </span>
        {summary && <span className="ml-auto text-xs text-fg-3">{summary}</span>}
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
            <div className="border-t border-line px-5 py-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  )
}
