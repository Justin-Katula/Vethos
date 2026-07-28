import { motion } from 'framer-motion'
import type { Objective, TimeRule } from '@shared/schemas'
import { iconByName } from '@/lib/rule-palette'
import { cn } from '@/lib/cn'

type Props = {
  objective: Objective
  rules: TimeRule[]
  urgency?: 'warning' | 'critical'
  onClick?: () => void
}

export function ObjectiveCard({
  objective,
  rules,
  urgency,
  onClick,
}: Props): JSX.Element {
  const Icon = iconByName(objective.icon)
  const linkedNames = rules
    .filter((r) => objective.linkedRuleIds.includes(r.id))
    .map((r) => r.name)
  const urgencyBorder =
    urgency === 'critical'
      ? 'border-red-500/70'
      : urgency === 'warning'
        ? 'border-orange/70'
        : 'border-border-subtle'

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'group relative flex w-full flex-col gap-4 overflow-hidden rounded-xl border bg-bg-elevated p-5 text-left shadow-card transition-colors hover:border-border-strong',
        urgencyBorder,
      )}
    >
      {/* Color bar */}
      <div
        className="absolute left-0 right-0 top-0 h-1 transition-all group-hover:h-1.5"
        style={{ backgroundColor: objective.color }}
      />

      <div className="flex items-start gap-4">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${objective.color}22`, color: objective.color }}
        >
          {Icon ? <Icon size={22} /> : <span className="text-lg font-semibold">{objective.name.charAt(0)}</span>}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold tracking-tight text-text-primary">
            {objective.name}
          </h3>
          {objective.description && (
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-text-muted">
              {objective.description}
            </p>
          )}
        </div>

        <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-full ring-2 ring-bg-base">
          <span className="text-sm font-bold tabular-nums text-text-primary">
            {Math.round(objective.weeklyTargetMinutes / 60)}
          </span>
          <span className="text-[8px] uppercase tracking-wider text-text-muted">h/sem</span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 border-t border-border-subtle pt-3">
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-widest text-text-muted">Cible hebdo</div>
          <div className="text-sm font-bold tabular-nums text-text-primary">
            {Math.round(objective.weeklyTargetMinutes / 60)}h
          </div>
        </div>
      </div>

      {linkedNames.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {linkedNames.slice(0, 3).map((n) => (
            <span
              key={n}
              className="rounded-2xl border border-border-subtle bg-bg-base px-2 py-0.5 text-[10px] text-text-secondary"
            >
              {n}
            </span>
          ))}
          {linkedNames.length > 3 && (
            <span className="rounded-2xl border border-border-subtle bg-bg-base px-2 py-0.5 text-[10px] text-text-muted">
              +{linkedNames.length - 3}
            </span>
          )}
        </div>
      )}
    </motion.button>
  )
}
