import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Trash2 } from 'lucide-react'
import type { ScheduleEntry, TimeRule } from '@shared/schemas'
import { hasOverlap, snapTo15 } from '@/lib/schedule-selectors'
import { minuteToClockLabel, durationLabel } from '@/lib/format-time'
import { iconByName } from '@/lib/rule-palette'
import { cn } from '@/lib/cn'
import { EntryQuickPicker } from './EntryQuickPicker'

type Props = {
  rules: TimeRule[]
  entries: ScheduleEntry[]
  onCreateEntry: (draft: {
    ruleId: string
    dayOfWeek: number
    startMinute: number
    endMinute: number
  }) => Promise<void>
  onUpdateEntry: (
    id: string,
    patch: { startMinute: number; endMinute: number },
  ) => Promise<void>
  onChangeRule: (id: string, ruleId: string) => Promise<void>
  onDeleteEntry: (id: string) => Promise<void>
  onCreateRule: () => void
}

const DAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const HOUR_HEIGHT = 40 // px par heure
const TOTAL_HEIGHT = 24 * HOUR_HEIGHT
const HEADER_HEIGHT = 36
const GUTTER_WIDTH = 48 // colonne des heures à gauche

type Drag =
  | { type: 'create'; dayOfWeek: number; startMinute: number; endMinute: number }
  | {
      type: 'resize'
      entryId: string
      edge: 'top' | 'bottom'
      dayOfWeek: number
      startMinute: number
      endMinute: number
    }

type PickerState = {
  dayOfWeek: number
  startMinute: number
  endMinute: number
  x: number
  y: number
}

export function WeekCalendar({
  rules,
  entries,
  onCreateEntry,
  onUpdateEntry,
  onChangeRule,
  onDeleteEntry,
  onCreateRule,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [picker, setPicker] = useState<PickerState | null>(null)
  const [activeMenu, setActiveMenu] = useState<string | null>(null)

  const ruleById = useMemo(() => new Map(rules.map((r) => [r.id, r])), [rules])

  const minuteFromY = (clientY: number): number => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return 0
    const y = clientY - rect.top - HEADER_HEIGHT
    const m = Math.round((y / TOTAL_HEIGHT) * 1440)
    return Math.max(0, Math.min(1440, m))
  }

  const onCellMouseDown = (e: React.MouseEvent, dayOfWeek: number) => {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest('[data-entry]')) return
    if ((e.target as HTMLElement).closest('[data-resize]')) return
    const startMinute = snapTo15(minuteFromY(e.clientY))
    setDrag({
      type: 'create',
      dayOfWeek,
      startMinute,
      endMinute: Math.min(1440, startMinute + 15),
    })
    setActiveMenu(null)
  }

  const onResizeMouseDown = (
    e: React.MouseEvent,
    entry: ScheduleEntry,
    edge: 'top' | 'bottom',
  ) => {
    e.stopPropagation()
    if (e.button !== 0) return
    setDrag({
      type: 'resize',
      entryId: entry.id,
      edge,
      dayOfWeek: entry.dayOfWeek,
      startMinute: entry.startMinute,
      endMinute: entry.endMinute,
    })
    setActiveMenu(null)
  }

  useEffect(() => {
    if (!drag) return
    const onMove = (e: MouseEvent) => {
      const m = snapTo15(minuteFromY(e.clientY))
      if (drag.type === 'create') {
        const end = Math.max(drag.startMinute + 15, m)
        setDrag({ ...drag, endMinute: Math.min(1440, end) })
      } else if (drag.type === 'resize') {
        if (drag.edge === 'top') {
          const start = Math.min(drag.endMinute - 15, m)
          setDrag({ ...drag, startMinute: Math.max(0, start) })
        } else {
          const end = Math.max(drag.startMinute + 15, m)
          setDrag({ ...drag, endMinute: Math.min(1440, end) })
        }
      }
    }
    const onUp = (e: MouseEvent) => {
      if (drag.type === 'create') {
        if (drag.endMinute - drag.startMinute < 15) {
          setDrag(null)
          return
        }
        const overlaps = hasOverlap(entries, {
          dayOfWeek: drag.dayOfWeek,
          startMinute: drag.startMinute,
          endMinute: drag.endMinute,
        })
        if (overlaps) {
          setDrag(null)
          return
        }
        const rect = containerRef.current?.getBoundingClientRect()
        if (rect) {
          const x = e.clientX - rect.left
          const y = e.clientY - rect.top
          setPicker({
            dayOfWeek: drag.dayOfWeek,
            startMinute: drag.startMinute,
            endMinute: drag.endMinute,
            x: Math.min(x, rect.width - 280),
            y: Math.min(y, rect.height - 200),
          })
        }
      } else if (drag.type === 'resize') {
        const overlaps = hasOverlap(entries, {
          id: drag.entryId,
          dayOfWeek: drag.dayOfWeek,
          startMinute: drag.startMinute,
          endMinute: drag.endMinute,
        })
        if (!overlaps) {
          void onUpdateEntry(drag.entryId, {
            startMinute: drag.startMinute,
            endMinute: drag.endMinute,
          })
        }
      }
      setDrag(null)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [drag, entries, onUpdateEntry])

  const handlePickRule = async (ruleId: string) => {
    if (!picker) return
    try {
      await onCreateEntry({
        ruleId,
        dayOfWeek: picker.dayOfWeek,
        startMinute: picker.startMinute,
        endMinute: picker.endMinute,
      })
    } catch {
      /* déjà géré par le store, on ferme juste */
    }
    setPicker(null)
  }

  const renderEntryBlock = (entry: ScheduleEntry) => {
    const rule = ruleById.get(entry.ruleId)
    if (!rule) return null
    const Icon = iconByName(rule.icon)
    const isMenuOpen = activeMenu === entry.id
    const beingDragged = drag?.type === 'resize' && drag.entryId === entry.id
    const eff = beingDragged
      ? { startMinute: drag.startMinute, endMinute: drag.endMinute }
      : { startMinute: entry.startMinute, endMinute: entry.endMinute }
    const liveTop = HEADER_HEIGHT + (eff.startMinute / 1440) * TOTAL_HEIGHT
    const liveHeight = ((eff.endMinute - eff.startMinute) / 1440) * TOTAL_HEIGHT

    return (
      <div
        key={entry.id}
        data-entry
        className="absolute left-1 right-1 cursor-pointer overflow-hidden rounded-md ring-1 transition-shadow hover:ring-2"
        style={{
          top: liveTop,
          height: liveHeight,
          backgroundColor: rule.color,
          // @ts-expect-error custom prop for ring color
          '--tw-ring-color': rule.color + 'aa',
        }}
        onClick={(e) => {
          e.stopPropagation()
          setActiveMenu(isMenuOpen ? null : entry.id)
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent" />
        <div
          data-resize
          className="absolute inset-x-0 top-0 z-10 h-1.5 cursor-ns-resize hover:bg-white/30"
          onMouseDown={(e) => onResizeMouseDown(e, entry, 'top')}
        />
        <div
          data-resize
          className="absolute inset-x-0 bottom-0 z-10 h-1.5 cursor-ns-resize hover:bg-white/30"
          onMouseDown={(e) => onResizeMouseDown(e, entry, 'bottom')}
        />
        <div className="relative flex h-full flex-col p-1.5 text-white drop-shadow-sm">
          <div className="flex items-center gap-1 text-[11px] font-semibold leading-tight">
            {Icon && <Icon size={11} strokeWidth={2.5} />}
            <span className="truncate">{rule.name}</span>
          </div>
          {liveHeight > 28 && (
            <div className="text-[10px] leading-tight opacity-80">
              {minuteToClockLabel(eff.startMinute)} — {minuteToClockLabel(eff.endMinute)}
              {liveHeight > 50 && (
                <> · {durationLabel(eff.endMinute - eff.startMinute)}</>
              )}
            </div>
          )}
        </div>
        <AnimatePresence>
          {isMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="absolute left-1/2 top-full z-20 mt-1 flex -translate-x-1/2 flex-col gap-0.5 rounded-md border border-border-subtle bg-bg-elevated p-1 shadow-elevated"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-2 pb-1 pt-0.5 text-[10px] font-medium uppercase tracking-wider text-text-muted">
                Changer de règle
              </div>
              {rules.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={async () => {
                    if (r.id !== entry.ruleId) await onChangeRule(entry.id, r.id)
                    setActiveMenu(null)
                  }}
                  className="flex items-center gap-2 rounded-md px-2 py-1 text-left text-xs text-text-primary hover:bg-bg-card"
                >
                  <span
                    className="h-2.5 w-2.5 rounded-2xl"
                    style={{ backgroundColor: r.color }}
                  />
                  <span className="truncate">{r.name}</span>
                </button>
              ))}
              <div className="my-0.5 h-px bg-border-subtle" />
              <button
                type="button"
                onClick={async () => {
                  await onDeleteEntry(entry.id)
                  setActiveMenu(null)
                }}
                className="flex items-center gap-2 rounded-md px-2 py-1 text-left text-xs text-red-400 hover:bg-red-500/10"
              >
                <Trash2 size={11} />
                Supprimer
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  // Ghost pendant un drag-create
  const renderGhost = () => {
    if (!drag || drag.type !== 'create') return null
    const overlaps = hasOverlap(entries, {
      dayOfWeek: drag.dayOfWeek,
      startMinute: drag.startMinute,
      endMinute: drag.endMinute,
    })
    const top = HEADER_HEIGHT + (drag.startMinute / 1440) * TOTAL_HEIGHT
    const height = ((drag.endMinute - drag.startMinute) / 1440) * TOTAL_HEIGHT
    return (
      <div
        className={cn(
          'pointer-events-none absolute left-1 right-1 rounded-md border-2 bg-accent/30',
          overlaps ? 'border-red-500 bg-red-500/30' : 'border-accent',
        )}
        style={{ top, height }}
      >
        <div className="px-1.5 py-1 text-[10px] text-white">
          {minuteToClockLabel(drag.startMinute)} — {minuteToClockLabel(drag.endMinute)}
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-lg border border-border-subtle bg-bg-card"
      style={{ height: TOTAL_HEIGHT + HEADER_HEIGHT }}
    >
      {/* Header jours */}
      <div
        className="absolute inset-x-0 top-0 z-10 flex border-b border-border-subtle bg-bg-elevated/80 backdrop-blur"
        style={{ height: HEADER_HEIGHT }}
      >
        <div style={{ width: GUTTER_WIDTH }} />
        {DAYS_FR.map((d) => (
          <div
            key={d}
            className="flex flex-1 items-center justify-center text-xs font-medium uppercase tracking-wider text-text-muted"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Gutter heures */}
      <div
        className="absolute left-0 top-0 z-0 border-r border-border-subtle"
        style={{ width: GUTTER_WIDTH, top: HEADER_HEIGHT, height: TOTAL_HEIGHT }}
      >
        {Array.from({ length: 24 }, (_, h) => (
          <div
            key={h}
            className="absolute left-0 right-1 text-right text-[10px] font-mono text-text-muted"
            style={{ top: (h / 24) * TOTAL_HEIGHT - 6 }}
          >
            {h === 0 ? '' : `${String(h).padStart(2, '0')}h`}
          </div>
        ))}
      </div>

      {/* Colonnes jours */}
      <div
        className="absolute right-0 flex"
        style={{
          left: GUTTER_WIDTH,
          top: HEADER_HEIGHT,
          height: TOTAL_HEIGHT,
        }}
      >
        {DAYS_FR.map((_, dayOfWeek) => (
          <div
            key={dayOfWeek}
            className="relative flex-1 border-r border-border-subtle/60 last:border-r-0"
            onMouseDown={(e) => onCellMouseDown(e, dayOfWeek)}
          >
            {/* lignes horaires */}
            {Array.from({ length: 24 }, (_, h) => (
              <div
                key={h}
                className="absolute inset-x-0 border-t border-border-subtle/40"
                style={{ top: (h / 24) * TOTAL_HEIGHT }}
              />
            ))}
            {/* lignes demi-heure */}
            {Array.from({ length: 24 }, (_, h) => (
              <div
                key={`half-${h}`}
                className="absolute inset-x-0 border-t border-border-subtle/15"
                style={{ top: ((h + 0.5) / 24) * TOTAL_HEIGHT }}
              />
            ))}
            {entries.filter((e) => e.dayOfWeek === dayOfWeek).map(renderEntryBlock)}
            {drag?.type === 'create' && drag.dayOfWeek === dayOfWeek && (
              <div
                className="pointer-events-none absolute inset-0"
                style={{ top: -HEADER_HEIGHT }}
              >
                <div style={{ position: 'relative', height: TOTAL_HEIGHT + HEADER_HEIGHT }}>
                  {renderGhost()}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Quick picker */}
      {picker && (
        <EntryQuickPicker
          rules={rules}
          x={picker.x}
          y={picker.y}
          onPick={(ruleId) => void handlePickRule(ruleId)}
          onCreateNew={() => {
            setPicker(null)
            onCreateRule()
          }}
          onCancel={() => setPicker(null)}
        />
      )}
    </div>
  )
}
