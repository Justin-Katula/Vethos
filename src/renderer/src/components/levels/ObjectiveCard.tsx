import { motion } from 'framer-motion'
import type { BlockingHistoryEntry, Objective, TimeRule } from '@shared/schemas'
import { iconByName } from '@/lib/rule-palette'
import { getLevelInfo } from '@/lib/levels'
import { LevelRing } from './LevelRing'

type Props = {
  objective: Objective
  rules: TimeRule[]
  history: BlockingHistoryEntry[]
  onClick?: () => void
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Calcule les minutes effectives sur les 7 derniers jours en filtrant
 * l'historique par les règles liées à cet objectif.
 */
function minutesThisWeek(
  objective: Objective,
  rules: TimeRule[],
  history: BlockingHistoryEntry[],
): number {
  const linkedRuleIds = new Set(objective.linkedRuleIds)
  const profileIds = new Set(
    rules
      .filter((r) => linkedRuleIds.has(r.id) && r.linkedProfileId !== null)
      .map((r) => r.linkedProfileId!),
  )
  if (profileIds.size === 0) return 0

  const cutoff = Date.now() - SEVEN_DAYS_MS
  let total = 0
  for (const h of history) {
    if (!h.completedNormally) continue
    if (!profileIds.has(h.profileId)) continue
    const ended = new Date(h.endedAt).getTime()
    if (ended < cutoff) continue
    const start = new Date(h.startedAt).getTime()
    total += Math.max(0, Math.round((ended - start) / 60000))
  }
  return total
}

export function ObjectiveCard({
  objective,
  rules,
  history,
  onClick,
}: Props): JSX.Element {
  const Icon = iconByName(objective.icon)
  const info = getLevelInfo(objective.xpMinutes)
  const weekMin = minutesThisWeek(objective, rules, history)
  const linkedNames = rules
    .filter((r) => objective.linkedRuleIds.includes(r.id))
    .map((r) => r.name)

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
      className="group relative flex w-full flex-col gap-4 overflow-hidden rounded-xl border border-border-subtle bg-bg-elevated p-5 text-left shadow-card transition-colors hover:border-border-strong"
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

        <LevelRing
          level={info.level}
          progress={info.progress}
          size={56}
          color={objective.color}
          isMax={info.isMax}
        />
      </div>

      <div className="flex items-end justify-between gap-3 border-t border-border-subtle pt-3">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-text-muted">
            Cette semaine
          </div>
          <div className="mt-0.5 text-lg font-bold tabular-nums text-text-primary">
            {weekMin > 0 ? `${weekMin} min` : '—'}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest text-text-muted">XP total</div>
          <div className="mt-0.5 text-lg font-bold tabular-nums text-text-primary">
            {objective.xpMinutes}
          </div>
        </div>
      </div>

      {linkedNames.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {linkedNames.slice(0, 3).map((n) => (
            <span
              key={n}
              className="rounded-full border border-border-subtle bg-bg-base px-2 py-0.5 text-[10px] text-text-secondary"
            >
              {n}
            </span>
          ))}
          {linkedNames.length > 3 && (
            <span className="rounded-full border border-border-subtle bg-bg-base px-2 py-0.5 text-[10px] text-text-muted">
              +{linkedNames.length - 3}
            </span>
          )}
        </div>
      )}
    </motion.button>
  )
}
