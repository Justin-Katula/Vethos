import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Calendar, Check } from 'lucide-react'
import { cn } from '@/lib/cn'
import {
  applyTemplate,
  TEMPLATES,
  type Template,
  type TemplateId,
} from '@/lib/onboarding-templates'
import { useScheduleStore } from '@/store/schedule.store'
import type { ScheduleEntry, TimeRule } from '@shared/schemas'

type Props = {
  onTemplateApplied: (ruleIds: string[]) => void
}

const DAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

export function ScheduleStep({ onTemplateApplied }: Props): JSX.Element {
  const replaceAll = useScheduleStore((s) => s.replaceAll)
  const loaded = useScheduleStore((s) => s.loaded)
  const load = useScheduleStore((s) => s.load)

  const [selectedId, setSelectedId] = useState<TemplateId | null>(null)
  const [preview, setPreview] = useState<{
    rules: TimeRule[]
    entries: ScheduleEntry[]
  } | null>(null)

  useEffect(() => {
    if (!loaded) void load()
  }, [loaded, load])

  const ruleColorById = useMemo(() => {
    if (!preview) return new Map<string, string>()
    return new Map(preview.rules.map((r) => [r.id, r.color]))
  }, [preview])

  const handleSelect = async (tpl: Template): Promise<void> => {
    setSelectedId(tpl.id)
    const applied = applyTemplate(tpl)
    setPreview(applied)
    await replaceAll(applied.rules, applied.entries)
    onTemplateApplied(applied.rules.map((r) => r.id))
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent">
          <Calendar size={22} />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Choisis ton point de départ.</h1>
        <p className="max-w-xl text-sm text-text-secondary">
          {"Pose 10 blocs colorés sur ta semaine en un clic. Tu pourras tout ajuster ensuite dans Mon planning."}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {TEMPLATES.map((tpl) => {
          const selected = selectedId === tpl.id
          return (
            <motion.button
              key={tpl.id}
              type="button"
              onClick={() => void handleSelect(tpl)}
              whileHover={{ y: -2 }}
              className={cn(
                'group relative flex flex-col gap-3 overflow-hidden rounded-xl border p-5 text-left transition-colors',
                selected
                  ? 'border-accent bg-accent/5'
                  : 'border-border-subtle bg-bg-elevated hover:border-border-strong',
              )}
            >
              {selected && (
                <div className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-white">
                  <Check size={14} strokeWidth={3} />
                </div>
              )}
              <div className="flex items-center gap-1">
                {tpl.rules.slice(0, 5).map((r) => (
                  <div
                    key={r.id}
                    className="h-6 w-6 rounded-full ring-2 ring-bg-elevated"
                    style={{ backgroundColor: r.color }}
                  />
                ))}
              </div>
              <div>
                <div className="text-base font-semibold tracking-tight text-text-primary">
                  {tpl.label}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-text-muted">
                  {tpl.description}
                </p>
              </div>
              <div className="flex items-center gap-3 text-[10px] uppercase tracking-widest text-text-muted">
                <span>{tpl.rules.length} règles</span>
                <span>·</span>
                <span>{tpl.entries.length} blocs</span>
              </div>
            </motion.button>
          )
        })}
      </div>

      {preview && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="rounded-xl border border-border-subtle bg-bg-elevated p-4"
        >
          <div className="mb-2 text-[10px] font-medium uppercase tracking-widest text-text-muted">
            Aperçu de ta semaine
          </div>
          <SchedulePreview entries={preview.entries} ruleColorById={ruleColorById} />
        </motion.div>
      )}
    </div>
  )
}

function SchedulePreview({
  entries,
  ruleColorById,
}: {
  entries: ScheduleEntry[]
  ruleColorById: Map<string, string>
}): JSX.Element {
  // Mini grille SVG : 7 colonnes (jours) × 24 heures (24 lignes par 60 min, on
  // utilise 0..1440 minutes pour la position verticale).
  const W = 560
  const H = 140
  const colW = W / 7
  const minuteToY = (m: number): number => (m / 1440) * H

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H + 22}`} className="block">
      {/* Day headers */}
      {DAYS.map((d, i) => (
        <text
          key={i}
          x={i * colW + colW / 2}
          y={12}
          textAnchor="middle"
          className="fill-text-muted"
          style={{ fontSize: 9, fontWeight: 600, letterSpacing: 1 }}
        >
          {d}
        </text>
      ))}
      <g transform="translate(0, 22)">
        {/* Day backgrounds */}
        {DAYS.map((_, i) => (
          <rect
            key={i}
            x={i * colW + 1}
            y={0}
            width={colW - 2}
            height={H}
            rx={4}
            fill="rgba(255,255,255,0.03)"
          />
        ))}
        {/* Entries */}
        {entries.map((e) => {
          const x = e.dayOfWeek * colW + 2
          const y = minuteToY(e.startMinute)
          const h = minuteToY(e.endMinute) - minuteToY(e.startMinute)
          const color = ruleColorById.get(e.ruleId) ?? '#64748b'
          return (
            <motion.rect
              key={e.id}
              initial={{ opacity: 0, scaleY: 0 }}
              animate={{ opacity: 1, scaleY: 1 }}
              transition={{ duration: 0.4 }}
              x={x}
              y={y}
              width={colW - 4}
              height={Math.max(2, h)}
              rx={2}
              fill={color}
              style={{ originY: y }}
              opacity={0.85}
            />
          )
        })}
      </g>
    </svg>
  )
}
