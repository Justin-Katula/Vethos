import { motion } from 'framer-motion'
import { cn } from '@/lib/cn'

/** Le tableau du jour : heure, engagement, duree, dans cet ordre. */

export type BoardRowState = 'normal' | 'now' | 'changed' | 'done'

export function Board({
  columns,
  children,
  className,
}: {
  /** Intitulés gravés en tête de colonne. Le dernier est calé à droite. */
  columns: [string, string, string]
  children: React.ReactNode
  className?: string
}) {
  // Un tableau de gare se lit de loin, avec vingt lignes qui guident l'œil.
  // Sur un écran, à une ou deux lignes, une colonne de mille pixels ouvre un
  // canyon entre le libellé et sa durée : la largeur est plafonnée pour que le
  // regard fasse le trajet.
  return (
    <div className={cn('surface overflow-hidden', className)}>
      <div className="flex items-baseline gap-4 border-b border-line px-5 py-3 text-[11px] font-medium text-fg-3">
        <span className="w-[4.5rem] shrink-0">{columns[0]}</span>
        <span className="min-w-0 flex-1">{columns[1]}</span>
        <span className="shrink-0">{columns[2]}</span>
      </div>
      <div>{children}</div>
    </div>
  )
}

export function BoardRow({
  time,
  label,
  /** L'état, imprimé dans la ligne. Jamais un badge. */
  note,
  value,
  state = 'normal',
  onClick,
  trailing,
}: {
  time: string
  label: string
  note?: string
  value?: string
  state?: BoardRowState
  onClick?: () => void
  trailing?: React.ReactNode
}) {
  const interactive = Boolean(onClick)

  return (
    <motion.div
      layout
      transition={{ type: 'spring', stiffness: 320, damping: 34 }}
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick?.()
              }
            }
          : undefined
      }
      className={cn(
        'group relative flex items-baseline gap-4 border-b border-line px-5 py-3 text-sm last:border-b-0',
        state === 'now' && 'bg-accent text-white',
        state === 'done' && 'text-fg-3',
        interactive && state !== 'now' && 'cursor-pointer hover:bg-surface-2',
        interactive && state === 'now' && 'cursor-pointer',
      )}
    >
      <span
        className={cn(
          'w-[4.5rem] shrink-0 font-mono text-[13px]',
          state === 'now' ? 'text-white/75' : state === 'done' ? 'text-fg-3' : 'text-fg-2',
        )}
      >
        {time}
      </span>

      <span className="flex min-w-0 flex-1 items-baseline gap-2.5">
        {/* Un bloc passé n'est pas annulé, il est derrière toi : il s'éteint,
            il ne se raye pas. Une rature se lit comme une erreur. */}
        <span className="truncate">{label}</span>
        {note && (
          <span
            className={cn(
              'shrink-0 text-[11px]',
              state === 'changed' ? 'text-accent' : state === 'now' ? 'text-white/70' : 'text-fg-3',
            )}
          >
            {note}
          </span>
        )}
      </span>

      {value && (
        <span
          className={cn(
            'shrink-0 font-mono text-[13px]',
            state === 'now' ? 'text-white' : 'text-fg-2',
          )}
        >
          {value}
        </span>
      )}

      {trailing}
    </motion.div>
  )
}

/** Le tableau vide dit quoi faire, il ne dit pas qu'il est vide. */
export function BoardEmpty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-8 text-center text-[13px] text-fg-3">{children}</p>
}
