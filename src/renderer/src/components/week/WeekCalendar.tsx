import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Trash2, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { dayOfWeek as dowOf } from '@/lib/planning/dates'
import { BLOCK_COLOR, BLOCK_INK, CATEGORY_COLOR, CATEGORY_LABEL } from '@/lib/palette'
import { hasOverlap, removeEntry, replaceEntry, snapTo15 } from '@/lib/schedule-edit'
import {
  minuteToYPx,
  viewportHeightPx,
  visibleHoursOfViewport,
  yPxToMinute,
  type CalendarViewport,
} from '@/lib/calendar-viewport'
import { SCHEDULE_CATEGORIES, type ScheduleCategory } from '@shared/schemas'
import type { PlacedBlock, ScheduleEntry } from '@/lib/planning/types'

/**
 * La semaine, éditable à la main.
 *
 * La grille n'est pas qu'un affichage : c'est là qu'on déclare son temps. On
 * tire sur une colonne pour créer une occupation, on attrape un bord pour la
 * redimensionner, on clique dessus pour la changer ou la retirer. Déclarer un
 * cours en tapant deux heures dans un formulaire, puis aller vérifier ailleurs
 * si ça tombe au bon endroit, c'est deux fois le travail et une fois l'erreur.
 *
 * Ce que le moteur a placé n'est PAS déplaçable : c'est lui qui décide, et un
 * bloc qu'on pourrait traîner laisserait croire le contraire. On peut
 * seulement lui demander pourquoi il est là.
 */

const HOUR_HEIGHT = 40
const DAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const GUTTER = 46
const MIN_SLICE = 15

type Drag =
  | { type: 'create'; dayOfWeek: number; startMinute: number; endMinute: number }
  | {
      type: 'resize'
      index: number
      edge: 'top' | 'bottom'
      dayOfWeek: number
      startMinute: number
      endMinute: number
    }

type Picker = {
  dayOfWeek: number
  startMinute: number
  endMinute: number
  x: number
  y: number
}

type Props = {
  weekDates: string[]
  viewport: CalendarViewport
  entries: ScheduleEntry[]
  blocks: PlacedBlock[]
  today: string
  nowMinute: number
  onChangeEntries: (entries: ScheduleEntry[]) => void
}

function clock(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
}

function duration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`
}

const KIND_LABEL: Record<PlacedBlock['kind'], string> = {
  task: 'Tâche',
  objective: 'Objectif',
  ancre: 'Ancre',
}

/**
 * Pourquoi ce bloc est ici. Chaque phrase vient d'un fait que le moteur a
 * produit : rien n'est deviné, et rien n'est inventé pour meubler.
 */
function explain(block: PlacedBlock): string[] {
  const lines: string[] = []
  if (block.kind === 'task') {
    lines.push('Placé par échéance : ce qui est dû en premier est servi en premier.')
  } else if (block.kind === 'objective') {
    lines.push('Quota de la semaine, réparti selon ce que chaque jour peut réellement porter.')
  } else {
    lines.push('Heure fixe, choisie une fois. Elle ne bouge jamais d’un jour à l’autre.')
  }
  if (block.cognitiveWindow === 'PROFONDE') {
    lines.push('Posé sur un créneau où tu termines habituellement ce que tu commences.')
  } else if (block.cognitiveWindow === 'BASSE') {
    lines.push('Créneau peu fiable d’après tes propres relevés : rien d’exigeant n’y va.')
  }
  if (block.breakMinutes > 0) {
    lines.push(`${block.breakMinutes} min de pause sont comprises dans le bloc, pas ajoutées après.`)
  }
  if (block.capOverride) {
    lines.push('Dépasse le plafond de 40 % du jour : crise de deadline prouvée.')
  }
  if (block.reducedToMinimum) {
    lines.push('Réduite à sa version minimale parce que la journée était saturée.')
  }
  return lines
}

export function WeekCalendar({
  weekDates,
  viewport,
  entries,
  blocks,
  today,
  nowMinute,
  onChangeEntries,
}: Props) {
  const gridRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [picker, setPicker] = useState<Picker | null>(null)
  const [menuIndex, setMenuIndex] = useState<number | null>(null)
  const [explained, setExplained] = useState<PlacedBlock | null>(null)
  const reduce = useReducedMotion()

  const height = viewportHeightPx(viewport, HOUR_HEIGHT)
  const hours = useMemo(() => visibleHoursOfViewport(viewport), [viewport])

  const columns = useMemo(
    () =>
      weekDates.map((date) => ({
        date,
        dayOfWeek: dowOf(date),
        dayNumber: Number(date.slice(8)),
        isToday: date === today,
      })),
    [weekDates, today],
  )

  const minuteFromY = useCallback(
    (clientY: number): number => {
      const rect = gridRef.current?.getBoundingClientRect()
      if (!rect) return viewport.startMinute
      const m = Math.round(yPxToMinute(viewport, clientY - rect.top, HOUR_HEIGHT))
      return Math.max(viewport.startMinute, Math.min(viewport.endMinute, m))
    },
    [viewport],
  )

  const onColumnMouseDown = (e: React.MouseEvent, dayOfWeek: number) => {
    if (e.button !== 0) return
    const el = e.target as HTMLElement
    if (el.closest('[data-entry]') || el.closest('[data-resize]') || el.closest('[data-block]')) return
    const startMinute = snapTo15(minuteFromY(e.clientY))
    setDrag({
      type: 'create',
      dayOfWeek,
      startMinute,
      endMinute: Math.min(viewport.endMinute, startMinute + MIN_SLICE),
    })
    setMenuIndex(null)
    setExplained(null)
  }

  const onResizeMouseDown = (e: React.MouseEvent, index: number, edge: 'top' | 'bottom') => {
    e.stopPropagation()
    if (e.button !== 0) return
    const entry = entries[index]
    if (!entry) return
    setDrag({
      type: 'resize',
      index,
      edge,
      dayOfWeek: entry.dayOfWeek,
      startMinute: entry.startMinute,
      endMinute: entry.endMinute,
    })
    setMenuIndex(null)
  }

  useEffect(() => {
    if (!drag) return

    const onMove = (e: MouseEvent) => {
      const m = snapTo15(minuteFromY(e.clientY))
      setDrag((d) => {
        if (!d) return d
        if (d.type === 'create') {
          return { ...d, endMinute: Math.max(d.startMinute + MIN_SLICE, m) }
        }
        return d.edge === 'top'
          ? { ...d, startMinute: Math.min(d.endMinute - MIN_SLICE, m) }
          : { ...d, endMinute: Math.max(d.startMinute + MIN_SLICE, m) }
      })
    }

    const onUp = (e: MouseEvent) => {
      if (drag.type === 'create') {
        const long = drag.endMinute - drag.startMinute >= MIN_SLICE
        const clash = hasOverlap(entries, drag)
        if (long && !clash) {
          const rect = gridRef.current?.getBoundingClientRect()
          if (rect) {
            setPicker({
              dayOfWeek: drag.dayOfWeek,
              startMinute: drag.startMinute,
              endMinute: drag.endMinute,
              x: Math.min(e.clientX - rect.left, rect.width - 240),
              y: Math.min(e.clientY - rect.top, rect.height - 210),
            })
          }
        }
      } else if (!hasOverlap(entries, drag, drag.index)) {
        onChangeEntries(
          replaceEntry(entries, drag.index, {
            startMinute: drag.startMinute,
            endMinute: drag.endMinute,
          }),
        )
      }
      setDrag(null)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [drag, entries, minuteFromY, onChangeEntries])

  const createWithCategory = (category: ScheduleCategory) => {
    if (!picker) return
    onChangeEntries([
      ...entries,
      {
        dayOfWeek: picker.dayOfWeek,
        startMinute: picker.startMinute,
        endMinute: picker.endMinute,
        categoryType: category,
        label: CATEGORY_LABEL[category],
        color: CATEGORY_COLOR[category],
      },
    ])
    setPicker(null)
  }

  const top = (minute: number) =>
    minuteToYPx(viewport, Math.max(minute, viewport.startMinute), HOUR_HEIGHT)
  const span = (start: number, end: number) =>
    minuteToYPx(viewport, Math.min(end, viewport.endMinute), HOUR_HEIGHT) - top(start)

  return (
    <div className="relative flex w-full select-none">
      {/* Colonne des heures. */}
      <div className="relative shrink-0 pt-7" style={{ width: GUTTER }}>
        <div className="relative" style={{ height }}>
          {hours.map((h) => (
            <span
              key={h}
              className="absolute right-3 -translate-y-1/2 font-mono text-[10.5px] tabular-nums text-fg-3"
              style={{ top: minuteToYPx(viewport, h * 60, HOUR_HEIGHT) }}
            >
              {String(h).padStart(2, '0')}
            </span>
          ))}
        </div>
      </div>

      <div className="min-w-0 flex-1">
        {/* En-têtes de jour. */}
        <div className="mb-1 grid h-6 grid-cols-7 gap-1.5">
          {columns.map((c) => (
            <div key={c.date} className="flex items-baseline gap-1.5 px-1">
              <span className={cn('text-[11px] font-medium', c.isToday ? 'text-fg' : 'text-fg-3')}>
                {DAYS_FR[c.dayOfWeek]}
              </span>
              <span
                className={cn(
                  'font-mono text-[10.5px] tabular-nums',
                  c.isToday ? 'text-fg-2' : 'text-fg-3',
                )}
              >
                {c.dayNumber}
              </span>
            </div>
          ))}
        </div>

        <div ref={gridRef} className="grid grid-cols-7 gap-1.5" style={{ height }}>
          {columns.map((c) => {
            const dayEntries = entries
              .map((e, index) => ({ e, index }))
              .filter(({ e }) => e.dayOfWeek === c.dayOfWeek)
            const dayBlocks = blocks.filter((b) => b.date === c.date)

            return (
              <div
                key={c.date}
                onMouseDown={(e) => onColumnMouseDown(e, c.dayOfWeek)}
                className={cn(
                  'relative overflow-hidden rounded-md',
                  c.isToday ? 'bg-surface-2/70 ring-1 ring-line-strong' : 'bg-surface/60',
                  drag?.type === 'create' ? 'cursor-ns-resize' : 'cursor-crosshair',
                )}
              >
                {hours.slice(1).map((h) => (
                  <div
                    key={h}
                    className="pointer-events-none absolute inset-x-0 border-t border-line/60"
                    style={{ top: minuteToYPx(viewport, h * 60, HOUR_HEIGHT) }}
                  />
                ))}

                {/* Occupations déclarées : sombres, éditables. */}
                {dayEntries.map(({ e, index }) => {
                  const live =
                    drag?.type === 'resize' && drag.index === index
                      ? { startMinute: drag.startMinute, endMinute: drag.endMinute }
                      : e
                  const h = span(live.startMinute, live.endMinute)
                  if (h <= 0) return null
                  return (
                    <div
                      key={index}
                      data-entry
                      onClick={(ev) => {
                        ev.stopPropagation()
                        setMenuIndex(menuIndex === index ? null : index)
                      }}
                      className="group absolute inset-x-[3px] cursor-pointer overflow-hidden rounded-[5px] ring-1 ring-inset ring-white/5 transition-shadow hover:ring-white/20"
                      style={{
                        top: top(live.startMinute),
                        height: h,
                        backgroundColor: e.color || CATEGORY_COLOR[e.categoryType],
                      }}
                      title={`${e.label} · ${clock(live.startMinute)} → ${clock(live.endMinute)}`}
                    >
                      <div
                        data-resize
                        onMouseDown={(ev) => onResizeMouseDown(ev, index, 'top')}
                        className="absolute inset-x-0 top-0 z-10 h-1.5 cursor-ns-resize hover:bg-white/25"
                      />
                      <div
                        data-resize
                        onMouseDown={(ev) => onResizeMouseDown(ev, index, 'bottom')}
                        className="absolute inset-x-0 bottom-0 z-10 h-1.5 cursor-ns-resize hover:bg-white/25"
                      />
                      <div className="px-1.5 py-1">
                        <span className="block truncate text-[10.5px] font-medium leading-tight text-fg-2">
                          {e.label}
                        </span>
                        {h > 30 && (
                          <span className="mt-0.5 block truncate font-mono text-[9.5px] tabular-nums text-fg-3">
                            {clock(live.startMinute)}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}

                {/* Ce que le moteur a placé : clair, non déplaçable. */}
                {dayBlocks.map((b, i) => {
                  const h = span(b.startMinute, b.endMinute)
                  if (h <= 0) return null
                  return (
                    <motion.button
                      key={b.id}
                      type="button"
                      data-block
                      onClick={(ev) => {
                        ev.stopPropagation()
                        setExplained(b)
                        setMenuIndex(null)
                      }}
                      initial={reduce ? false : { opacity: 0, scaleY: 0.75 }}
                      animate={{ opacity: 1, scaleY: 1 }}
                      transition={{
                        duration: 0.32,
                        delay: 0.1 + i * 0.02,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                      whileHover={reduce ? undefined : { scale: 1.03, zIndex: 20 }}
                      className="absolute inset-x-[3px] origin-top overflow-hidden rounded-[5px] px-1.5 py-1 text-left"
                      style={{
                        top: top(b.startMinute),
                        height: Math.max(4, h - 2),
                        backgroundColor: b.color || BLOCK_COLOR[b.kind],
                        color: BLOCK_INK[b.kind],
                      }}
                      title={`${b.label} · ${clock(b.startMinute)} → ${clock(b.endMinute)}`}
                    >
                      <span className="block truncate text-[10.5px] font-medium leading-tight">
                        {b.label}
                      </span>
                      {h > 30 && (
                        <span className="mt-0.5 block truncate font-mono text-[9.5px] tabular-nums opacity-70">
                          {clock(b.startMinute)}
                        </span>
                      )}
                    </motion.button>
                  )
                })}

                {/* Fantôme de création. Refusé = hachuré, jamais rouge. */}
                {drag?.type === 'create' && drag.dayOfWeek === c.dayOfWeek && (
                  <Ghost
                    top={top(drag.startMinute)}
                    height={span(drag.startMinute, drag.endMinute)}
                    label={`${clock(drag.startMinute)} → ${clock(drag.endMinute)}`}
                    refused={hasOverlap(entries, drag)}
                  />
                )}

                {c.isToday && nowMinute >= viewport.startMinute && nowMinute <= viewport.endMinute && (
                  <div
                    className="pointer-events-none absolute inset-x-0 z-30 h-px bg-accent"
                    style={{ top: minuteToYPx(viewport, nowMinute, HOUR_HEIGHT) }}
                  >
                    <span className="absolute -left-px -top-[3px] h-[7px] w-[7px] rounded-full bg-accent" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Choix de la catégorie, juste après le tracé. */}
      <AnimatePresence>
        {picker && (
          <motion.div
            initial={reduce ? false : { opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="surface absolute z-40 w-56 p-1.5"
            style={{ left: picker.x + GUTTER, top: picker.y + 28 }}
          >
            <p className="px-2 pb-1.5 pt-1 font-mono text-[10.5px] tabular-nums text-fg-3">
              {clock(picker.startMinute)} → {clock(picker.endMinute)} ·{' '}
              {duration(picker.endMinute - picker.startMinute)}
            </p>
            {SCHEDULE_CATEGORIES.filter((k) => k !== 'sleep').map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => createWithCategory(k)}
                className="pressable flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-left text-[13px] text-fg-2 transition-colors hover:bg-surface-3 hover:text-fg"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-[3px] ring-1 ring-line"
                  style={{ backgroundColor: CATEGORY_COLOR[k] }}
                />
                {CATEGORY_LABEL[k]}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPicker(null)}
              className="mt-1 w-full rounded-sm px-2 py-1.5 text-left text-[11px] text-fg-3 transition-colors hover:text-fg-2"
            >
              Annuler
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Menu d'une occupation existante. */}
      <AnimatePresence>
        {menuIndex !== null && entries[menuIndex] && (
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="surface fixed bottom-8 left-1/2 z-40 w-[min(26rem,calc(100vw-8rem))] -translate-x-1/2 p-4"
          >
            <div className="mb-3 flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-fg">{entries[menuIndex]!.label}</p>
                <p className="mt-0.5 font-mono text-xs tabular-nums text-fg-3">
                  {clock(entries[menuIndex]!.startMinute)} {'→'}{' '}
                  {clock(entries[menuIndex]!.endMinute)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMenuIndex(null)}
                className="text-fg-3 transition-colors hover:text-fg"
                aria-label="Fermer"
              >
                <X size={15} />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SCHEDULE_CATEGORIES.filter((k) => k !== 'sleep').map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() =>
                    onChangeEntries(
                      replaceEntry(entries, menuIndex, {
                        categoryType: k,
                        label: CATEGORY_LABEL[k],
                        color: CATEGORY_COLOR[k],
                      }),
                    )
                  }
                  className={cn(
                    'pressable rounded-sm px-2.5 py-1.5 text-[12px] transition-colors',
                    entries[menuIndex]!.categoryType === k
                      ? 'bg-surface-3 text-fg'
                      : 'text-fg-3 hover:bg-surface-2 hover:text-fg-2',
                  )}
                >
                  {CATEGORY_LABEL[k]}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  onChangeEntries(removeEntry(entries, menuIndex))
                  setMenuIndex(null)
                }}
                className="pressable ml-auto flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-[12px] text-fg-3 transition-colors hover:bg-surface-2 hover:text-fg"
              >
                <Trash2 size={12} />
                Retirer
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pourquoi ce bloc est là. */}
      <AnimatePresence>
        {explained && (
          <motion.aside
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="surface fixed bottom-8 left-1/2 z-40 w-[min(30rem,calc(100vw-8rem))] -translate-x-1/2 p-5"
          >
            <div className="flex items-start gap-4">
              <span
                className="mt-1 h-9 w-1 shrink-0 rounded-full"
                style={{ backgroundColor: explained.color || BLOCK_COLOR[explained.kind] }}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-fg">{explained.label}</p>
                <p className="mt-0.5 font-mono text-xs tabular-nums text-fg-2">
                  {clock(explained.startMinute)} {'→'} {clock(explained.endMinute)}
                  <span className="ml-2 font-sans text-fg-3">
                    {KIND_LABEL[explained.kind]} · {duration(explained.workMinutes)}
                  </span>
                </p>
                <ul className="mt-3 space-y-1.5">
                  {explain(explained).map((line) => (
                    <li key={line} className="text-[12px] leading-relaxed text-fg-3">
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
              <button
                type="button"
                onClick={() => setExplained(null)}
                className="shrink-0 text-fg-3 transition-colors hover:text-fg"
                aria-label="Fermer"
              >
                <X size={15} />
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  )
}

/**
 * Le tracé en cours. Refusé, il devient hachuré plutôt que rouge : le monde
 * n'a pas de couleur, et une hachure dit « pas ici » aussi clairement.
 */
function Ghost({
  top,
  height,
  label,
  refused,
}: {
  top: number
  height: number
  label: string
  refused: boolean
}) {
  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-x-[3px] z-20 overflow-hidden rounded-[5px]',
        refused ? 'ring-1 ring-inset ring-fg-3' : 'bg-accent-soft ring-1 ring-inset ring-accent',
      )}
      style={{
        top,
        height,
        ...(refused
          ? {
              backgroundImage:
                'repeating-linear-gradient(45deg, rgba(255,255,255,0.14) 0 4px, transparent 4px 8px)',
            }
          : null),
      }}
    >
      <span className="block px-1.5 py-1 font-mono text-[9.5px] tabular-nums text-fg">
        {refused ? 'occupé' : label}
      </span>
    </div>
  )
}
