import { motion } from 'framer-motion'
import { Plus, Lock } from 'lucide-react'
import type { ScheduleEntry, TimeRule } from '@shared/schemas'
import { iconByName } from '@/lib/rule-palette'
import { cn } from '@/lib/cn'

type Props = {
  rules: TimeRule[]
  entries: ScheduleEntry[]
  onCreate: () => void
  onEdit: (rule: TimeRule) => void
}

export function RuleTable({ rules, entries, onCreate, onEdit }: Props) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {rules.map((r) => {
        const count = entries.filter((e) => e.ruleId === r.id).length
        const Icon = iconByName(r.icon)
        return (
          <motion.button
            key={r.id}
            type="button"
            onClick={() => onEdit(r)}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.98 }}
            className={cn(
              'group relative flex min-w-[180px] items-center gap-3 overflow-hidden rounded-lg border px-4 py-3 text-left transition-colors',
              'border-border-subtle bg-bg-card hover:border-border-strong',
            )}
          >
            <div
              className="absolute inset-0 opacity-0 transition-opacity group-hover:opacity-10"
              style={{ backgroundColor: r.color }}
            />
            <div
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ring-2 ring-bg-base"
              style={{ backgroundColor: r.color }}
            >
              {Icon ? <Icon size={16} className="text-white drop-shadow" /> : null}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 truncate text-sm font-medium text-text-primary">
                {r.name}
                {r.linkedProfileId && (
                  <Lock size={11} strokeWidth={2.5} className="text-text-muted" />
                )}
              </div>
              <div className="text-xs text-text-muted">
                {count} {count <= 1 ? 'bloc' : 'blocs'}
              </div>
            </div>
          </motion.button>
        )
      })}
      <motion.button
        type="button"
        onClick={onCreate}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.98 }}
        className="flex min-w-[180px] items-center gap-2 rounded-lg border border-dashed border-border-subtle px-4 py-3 text-sm text-text-secondary transition-colors hover:border-accent hover:text-accent"
      >
        <Plus size={14} strokeWidth={2.5} />
        Nouvelle règle
      </motion.button>
    </div>
  )
}
