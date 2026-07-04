import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { Plus } from 'lucide-react'
import type { TimeRule } from '@shared/schemas'
import { Button } from '@/components/ui/Button'

type Props = {
  rules: TimeRule[]
  /** Position en pixels relative au parent (le calendrier). */
  x: number
  y: number
  onPick: (ruleId: string) => void
  onCreateNew: () => void
  onCancel: () => void
}

export function EntryQuickPicker({ rules, x, y, onPick, onCreateNew, onCancel }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    const onClickAway = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onCancel()
    }
    window.addEventListener('keydown', onKey)
    // Délai pour éviter de capter le mouseup qui vient de finir le drag-create
    const t = setTimeout(() => window.addEventListener('mousedown', onClickAway), 30)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onClickAway)
      clearTimeout(t)
    }
  }, [onCancel])

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="absolute z-30 flex max-w-[260px] flex-col gap-1 rounded-lg border border-border-subtle bg-bg-elevated p-2 shadow-elevated"
      style={{ left: x, top: y }}
    >
      <div className="px-2 pb-1 pt-0.5 text-[10px] font-medium uppercase tracking-wider text-text-muted">
        Choisir une règle
      </div>
      {rules.length === 0 && (
        <div className="px-2 py-1 text-xs text-text-muted">Aucune règle. Crée-en une ↓</div>
      )}
      {rules.map((r) => (
        <Button
          key={r.id}
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onPick(r.id)}
          className="justify-start gap-2 text-left"
        >
          <span
            className="h-3 w-3 flex-shrink-0 rounded-2xl ring-2 ring-bg-base"
            style={{ backgroundColor: r.color }}
          />
          <span className="truncate">{r.name}</span>
        </Button>
      ))}
      <div className="my-1 h-px bg-border-subtle" />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onCreateNew}
        className="justify-start gap-2 text-left"
      >
        <Plus size={12} strokeWidth={2.5} />
        Nouvelle règle…
      </Button>
    </motion.div>
  )
}
