import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Lock, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { ScheduleEntry, TimeRule } from '@shared/schemas'
import { hasOverlap, snapTo15 } from '@/lib/schedule-selectors'
import { minuteToClockLabel, durationLabel } from '@/lib/format-time'
import { iconByName } from '@/lib/rule-palette'
import { cn } from '@/lib/cn'
import { EntryQuickPicker } from './EntryQuickPicker'
import {
  minuteToYPx,
  yPxToMinute,
  viewportHeightPx,
  visibleHoursOfViewport,
  type CalendarViewport,
} from '@/lib/calendar-viewport'
import type { PlacedBlock } from '@/lib/placement-engine'
import type { PlacementResult } from '@shared/engine-results'
import { workBlockLabel, workBlockTitle } from '@/lib/planning-ui'
import {
  decisionExplanationTitle,
  explainPlanningBlock,
  type DecisionExplanation,
} from '@/lib/decision-explanation'
import type { Task, Objective } from '@shared/schemas'

type Props = {
  rules: TimeRule[]
  entries: ScheduleEntry[]
  viewport: CalendarViewport
  weekDates: string[]
  workBlocks: PlacedBlock[]
  placementResults: Map<string, PlacementResult>
  taskById: Map<string, Task>
  objectiveById: Map<string, Objective>
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

function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number) as [number, number, number]
  return new Date(year, month - 1, day)
}

function dayOfWeekOf(dateStr: string): number {
  return (parseLocalDate(dateStr).getDay() + 6) % 7
}

export function WeekCalendar({
  rules,
  entries,
  viewport,
  weekDates,
  workBlocks,
  placementResults,
  taskById,
  objectiveById,
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
  const [activeExplanation, setActiveExplanation] = useState<DecisionExplanation | null>(null)

  const totalHeight = viewportHeightPx(viewport, HOUR_HEIGHT)
  const visibleHours = useMemo(() => visibleHoursOfViewport(viewport), [viewport])

  const ruleById = useMemo(() => new Map(rules.map((r) => [r.id, r])), [rules])
  const columns = useMemo(
    () =>
      weekDates.map((date) => {
        const parsed = parseLocalDate(date)
        const dayOfWeek = dayOfWeekOf(date)
        return {
          date,
          dayOfWeek,
          label: DAYS_FR[dayOfWeek],
          dayNumber: parsed.getDate(),
          monthNumber: parsed.getMonth() + 1,
        }
      }),
    [weekDates],
  )

  const minuteFromY = useCallback((clientY: number): number => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return viewport.startMinute
    const y = clientY - rect.top - HEADER_HEIGHT
    const m = Math.round(yPxToMinute(viewport, y, HOUR_HEIGHT))
    return Math.max(viewport.startMinute, Math.min(viewport.endMinute, m))
  }, [viewport])

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
  }, [drag, entries, onUpdateEntry, minuteFromY])

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
    // Clip aux bornes de la fenêtre visible.
    const clippedStart = Math.max(eff.startMinute, viewport.startMinute)
    const clippedEnd = Math.min(eff.endMinute, viewport.endMinute)
    if (clippedEnd <= clippedStart) return null
    const liveTop = minuteToYPx(viewport, clippedStart, HOUR_HEIGHT)
    const liveHeight = minuteToYPx(viewport, clippedEnd, HOUR_HEIGHT) - minuteToYPx(viewport, clippedStart, HOUR_HEIGHT)

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
                <Button
                  key={r.id}
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    if (r.id !== entry.ruleId) await onChangeRule(entry.id, r.id)
                    setActiveMenu(null)
                  }}
                  className="justify-start gap-2 text-left"
                >
                  <span
                    className="h-2.5 w-2.5 rounded-2xl"
                    style={{ backgroundColor: r.color }}
                  />
                  <span className="truncate">{r.name}</span>
                </Button>
              ))}
              <div className="my-0.5 h-px bg-border-subtle" />
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={async () => {
                  await onDeleteEntry(entry.id)
                  setActiveMenu(null)
                }}
                className="justify-start gap-2 text-left"
              >
                <Trash2 size={11} />
                Supprimer
              </Button>
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
    const top = minuteToYPx(viewport, drag.startMinute, HOUR_HEIGHT)
    const height =
      minuteToYPx(viewport, drag.endMinute, HOUR_HEIGHT) -
      minuteToYPx(viewport, drag.startMinute, HOUR_HEIGHT)
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

  // Couleur neutre pour les tâches autonomes (sans objectif).
  const STANDALONE_TASK_COLOR = '#64748b' // slate-500

  const renderWorkBlock = (block: PlacedBlock) => {
    const clippedStart = Math.max(block.startMinute, viewport.startMinute)
    const clippedEnd = Math.min(block.endMinute, viewport.endMinute)
    if (clippedEnd <= clippedStart) return null

    const top = minuteToYPx(viewport, clippedStart, HOUR_HEIGHT)
    const height =
      minuteToYPx(viewport, clippedEnd, HOUR_HEIGHT) -
      minuteToYPx(viewport, clippedStart, HOUR_HEIGHT)

    // Couleur, libellé principal, et tâche en sous-titre.
    let color = STANDALONE_TASK_COLOR
    let title = block.label || '...'
    let subtitle: string | null = null
    let taskForExplanation: Task | null = null
    let objectiveForExplanation: Objective | null = null

    if (block.kind === 'break') {
      color = '#0f766e'
      title = 'Récupération'
      subtitle = '20-20-20 · respiration · épaules'
    } else if (block.kind === 'task' && block.refId) {
      const task = taskById.get(block.refId)
      if (task) {
        taskForExplanation = task
        title = task.title
        if (task.linkedObjectiveId) {
          objectiveForExplanation = objectiveById.get(task.linkedObjectiveId) ?? null
        }
      }
    } else if (block.kind === 'objective' && block.refId) {
      const obj = objectiveById.get(block.refId)
      if (obj) {
        objectiveForExplanation = obj
        title = obj.name
        color = obj.color
      }
      const linkedTaskIds =
        block.linkedTaskIds.length > 0
          ? block.linkedTaskIds
          : block.linkedTaskId
            ? [block.linkedTaskId]
            : []
      const linkedTaskTitles = linkedTaskIds
        .map((id) => taskById.get(id)?.title)
        .filter((title): title is string => Boolean(title))
      const firstLinkedTitle = linkedTaskTitles[0]
      if (linkedTaskIds[0]) {
        taskForExplanation = taskById.get(linkedTaskIds[0]) ?? null
      }
      if (firstLinkedTitle) {
        subtitle =
          linkedTaskTitles.length === 1
            ? firstLinkedTitle
            : `${firstLinkedTitle} +${linkedTaskTitles.length - 1}`
      }
    }

    const blockMinutes = block.endMinute - block.startMinute
    const label = workBlockLabel(block)
    const placementResult = placementResults.get(block.id)
    const fallbackExplanation = explainPlanningBlock(block, taskForExplanation, objectiveForExplanation)
    const explanation: DecisionExplanation = placementResult ? {
      targetType: 'planning_block',
      targetId: block.id,
      reasonTags: fallbackExplanation.reasonTags,
      humanTitle: `Placement ${placementResult.placementQuality}`,
      humanReasons: [...placementResult.reasons, ...placementResult.warnings],
      severity: placementResult.placementQuality === 'impossible' ? 'critical' : placementResult.placementQuality === 'poor' ? 'high' : placementResult.warnings.length ? 'medium' : 'low',
      confidence: placementResult.placementScore,
      debug: { score: placementResult.placementScore, remainingMinutes: placementResult.durationMinutes },
    } : fallbackExplanation
    const titleWithExplanation = `${workBlockTitle(block)}\n\n${decisionExplanationTitle(explanation)}`

    return (
      <div
        key={block.id}
        data-locked-work-block
        title={titleWithExplanation}
        className="absolute left-1 right-1 cursor-default overflow-hidden rounded-md ring-1 ring-white/10"
        style={{
          top,
          height,
          backgroundColor: color,
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent" />
        <div className="relative flex h-full flex-col p-1.5 text-white drop-shadow-sm">
          <div className="flex items-center gap-1 text-[11px] font-semibold leading-tight">
            {height > 16 && <Lock size={10} strokeWidth={2.5} />}
            <span className="truncate">{title}</span>
          </div>
          {height > 18 && (
            <div className="truncate text-[9px] font-medium uppercase tracking-wider opacity-75">
              {label}
            </div>
          )}
          {height > 28 && subtitle && (
            <div className="truncate text-[10px] leading-tight opacity-80">{subtitle}</div>
          )}
          {height > 50 && (
            <div className="text-[10px] leading-tight opacity-70">
              {minuteToClockLabel(block.startMinute)} — {minuteToClockLabel(block.endMinute)}
              {blockMinutes < 30 && <> · {durationLabel(blockMinutes)}</>}
            </div>
          )}
          {height > 76 && explanation.humanReasons.length > 0 && (
            <button
              type="button"
              className="mt-auto w-fit rounded bg-black/25 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white/85 transition-colors hover:bg-black/40 hover:text-white"
              onClick={(event) => {
                event.stopPropagation()
                setActiveExplanation(explanation)
              }}
            >
              Pourquoi ?
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="info-panel rounded-lg"
      style={{ height: totalHeight + HEADER_HEIGHT }}
    >
      {/* Header jours */}
      <div
        className="absolute inset-x-0 top-0 z-10 flex border-b border-border-subtle bg-bg-elevated/80 backdrop-blur"
        style={{ height: HEADER_HEIGHT }}
      >
        <div style={{ width: GUTTER_WIDTH }} />
        {columns.map((column) => (
          <div
            key={column.date}
            className="flex flex-1 flex-col items-center justify-center text-text-muted"
          >
            <span className="text-xs font-medium uppercase tracking-wider">{column.label}</span>
            <span className="text-[10px] leading-none">
              {column.dayNumber}/{column.monthNumber}
            </span>
          </div>
        ))}
      </div>

      {/* Gutter heures */}
      <div
        className="absolute left-0 top-0 z-0 border-r border-border-subtle"
        style={{ width: GUTTER_WIDTH, top: HEADER_HEIGHT, height: totalHeight }}
      >
        {visibleHours.map((h) => (
          <div
            key={h}
            className="absolute left-0 right-1 text-right text-[10px] font-mono text-text-muted"
            style={{ top: Math.max(0, minuteToYPx(viewport, h * 60, HOUR_HEIGHT) - 6) }}
          >
            {`${String(h).padStart(2, '0')}h`}
          </div>
        ))}
      </div>

      {/* Colonnes jours */}
      <div
        className="absolute right-0 flex"
        style={{
          left: GUTTER_WIDTH,
          top: HEADER_HEIGHT,
          height: totalHeight,
        }}
      >
        {columns.map((column) => (
          <div
            key={column.date}
            className="relative flex-1 border-r border-border-subtle/60 last:border-r-0"
            onMouseDown={(e) => onCellMouseDown(e, column.dayOfWeek)}
          >
            {/* lignes horaires */}
            {visibleHours.map((h) => (
              <div
                key={`hr-${h}`}
                className="absolute inset-x-0 border-t border-border-subtle/40"
                style={{ top: minuteToYPx(viewport, h * 60, HOUR_HEIGHT) }}
              />
            ))}
            {/* lignes demi-heure */}
            {visibleHours.map((h) => (
              <div
                key={`half-${h}`}
                className="absolute inset-x-0 border-t border-border-subtle/15"
                style={{ top: minuteToYPx(viewport, h * 60 + 30, HOUR_HEIGHT) }}
              />
            ))}
            {entries.filter((e) => e.dayOfWeek === column.dayOfWeek).map(renderEntryBlock)}
            {/* Blocs de travail (lecture seule, par-dessus la grille) */}
            {workBlocks
              .filter((b) => b.date === column.date)
              .map((b) => renderWorkBlock(b))}
            {drag?.type === 'create' && drag.dayOfWeek === column.dayOfWeek && renderGhost()}
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

      <DecisionExplanationDialog
        explanation={activeExplanation}
        onClose={() => setActiveExplanation(null)}
      />
    </div>
  )
}

function DecisionExplanationDialog({
  explanation,
  onClose,
}: {
  explanation: DecisionExplanation | null
  onClose: () => void
}) {
  return (
    <AnimatePresence>
      {explanation && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-6 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => {
            event.stopPropagation()
            onClose()
          }}
        >
          <motion.div
            className="w-full max-w-lg rounded-2xl border border-border-subtle bg-bg-card p-6 shadow-2xl"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">
                  Explication Vethos
                </div>
                <h3 className="mt-2 text-xl font-semibold text-text-primary">
                  {explanation.humanTitle}
                </h3>
              </div>
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-sm text-text-muted transition-colors hover:bg-bg-card-hover hover:text-text-primary"
                onClick={onClose}
              >
                ×
              </button>
            </div>

            <div className="mt-5 rounded-xl border border-border-subtle bg-bg-base/40 p-4">
              <div className="text-sm font-medium text-text-primary">
                Vethos a placé ce bloc ici parce que :
              </div>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-text-secondary">
                {explanation.humanReasons.map((reason) => (
                  <li key={reason} className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent" />
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-4 text-xs text-text-muted">
              {explanation.severity === 'critical' || explanation.severity === 'high'
                ? 'Ce placement demande une attention particulière.'
                : explanation.severity === 'medium'
                  ? 'Ce placement reste raisonnable, avec quelques points à surveiller.'
                  : 'Ce placement est cohérent avec ton temps disponible.'}
            </div>

            <div className="mt-5 flex justify-end">
              <Button type="button" size="sm" onClick={onClose}>
                Compris
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
