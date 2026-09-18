import { cn } from '@/lib/cn'

/** Petites pièces réutilisables du tableau de temps. */

export type PillTone = 'iris' | 'quiet' | 'warn'

export function MetricPill({
  icon,
  value,
  unit,
  label,
  tone = 'iris',
  className,
}: {
  icon?: React.ReactNode
  value: string
  /** Suffixe collé au nombre, plus petit et plus sourd : « h », « min ». */
  unit?: string
  label: string
  tone?: PillTone
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center gap-2.5', className)}>
      <div
        className={cn(
          'relative flex min-h-[58px] min-w-[7.5rem] items-center justify-center gap-2 rounded border px-4 py-2',
          'bg-surface transition-colors duration-200',
          tone === 'iris' && 'border-accent/50 bg-accent-soft',
          tone === 'quiet' && 'border-line',
          tone === 'warn' && 'border-warn/50 bg-warn/[0.06]',
        )}
      >
        {icon && (
          <span
            className={cn(
              'shrink-0',
              tone === 'iris' ? 'text-accent' : tone === 'warn' ? 'text-warn' : 'text-fg-3',
            )}
          >
            {icon}
          </span>
        )}
        <span className="flex items-baseline gap-1">
          <span
            className={cn(
              'num text-[21px] leading-none',
              tone === 'iris' ? 'text-accent' : tone === 'warn' ? 'text-warn' : 'text-fg-2',
            )}
          >
            {value}
          </span>
          {unit && (
            <span
              className={cn(
                'text-[12px] leading-none',
                tone === 'iris' ? 'text-accent/70' : tone === 'warn' ? 'text-warn/70' : 'text-fg-3',
              )}
            >
              {unit}
            </span>
          )}
        </span>
      </div>
      <span className="text-[12.5px] font-medium text-fg-2">{label}</span>
    </div>
  )
}

// ─── L'accolade ────────────────────────────────────────────────────────────

/**
 * Le trait qui relie une valeur aux valeurs qui la composent.
 *
 * Sans lui, un grand nombre au-dessus de trois capsules n'est qu'une pile :
 * rien ne dit que les trois expliquent le premier. L'accolade le dit d'un
 * seul trait, et c'est la seule chose qu'elle a à dire — donc elle reste
 * sourde, en `--line-strong`, et ne brille jamais.
 */
export function Bracket({ count = 3, className }: { count?: number; className?: string }) {
  // Le tracé est en pourcentage de la largeur : les branches tombent au centre
  // de chaque colonne, quel que soit le nombre de capsules.
  const spans = Array.from({ length: count }, (_, i) => ((i + 0.5) / count) * 100)
  const first = spans[0]!
  const last = spans[spans.length - 1]!
  const r = 1.6 // rayon des coins, en unités de la viewBox

  return (
    <svg
      viewBox="0 0 100 20"
      preserveAspectRatio="none"
      className={cn('h-5 w-full', className)}
      aria-hidden
    >
      <g
        fill="none"
        stroke="var(--line-strong)"
        strokeWidth={0.35}
        vectorEffect="non-scaling-stroke"
      >
        {/* La descente depuis la valeur, puis la barre horizontale. */}
        <path d={`M 50 0 V 8`} />
        <path
          d={`M ${first} 20 V ${8 + r} Q ${first} 8 ${first + r} 8 H ${last - r} Q ${last} 8 ${last} ${8 + r} V 20`}
        />
        {/* Les branches intermédiaires, s'il y en a. */}
        {spans.slice(1, -1).map((x) => (
          <path key={x} d={`M ${x} 8 V 20`} />
        ))}
      </g>
    </svg>
  )
}

// ─── La carte ──────────────────────────────────────────────────────────────

/** Une surface encadrée; `glow` devient un liseré d'attention. */
export function GlowCard({
  glow = false,
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { glow?: boolean }) {
  return (
    <div
      className={cn(
        'relative rounded border bg-surface p-5 shadow-lift',
        glow ? 'border-accent/50' : 'border-line',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  )
}
