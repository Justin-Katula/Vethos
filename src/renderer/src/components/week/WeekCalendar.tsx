import { useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { dayOfWeek as dowOf } from '@/lib/planning/dates'
import { BLOCK_COLOR, BLOCK_INK, CATEGORY_COLOR } from '@/lib/palette'
import {
  minuteToYPx,
  viewportHeightPx,
  visibleHoursOfViewport,
  type CalendarViewport,
} from '@/lib/calendar-viewport'
import type { PlacedBlock, ScheduleEntry } from '@/lib/planning/types'

/**
 * La semaine, telle que le moteur l'a décidée.
 *
 * On ne dessine rien ici, et c'est volontaire. Trouver un bon emplacement est
 * le travail de l'application : elle connaît la capacité réelle de chaque jour,
 * les échéances, les plafonds, la fatigue et le repos réservé. Laisser tracer
 * un bloc à la main, c'est demander à l'utilisateur de refaire ce calcul de
 * tête, et lui donner le moyen de le contredire.
 *
 * On déclare QUOI ailleurs. La grille montre OÙ ça tombe, et sait expliquer
 * pourquoi.
 */

const HOUR_HEIGHT = 40
const DAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const GUTTER = 46

type Props = {
  weekDates: string[]
  viewport: CalendarViewport
  entries: ScheduleEntry[]
  blocks: PlacedBlock[]
  today: string
  nowMinute: number
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

export function WeekCalendar({ weekDates, viewport, entries, blocks, today, nowMinute }: Props) {
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

  const top = (minute: number) =>
    minuteToYPx(viewport, Math.max(minute, viewport.startMinute), HOUR_HEIGHT)
  const span = (start: number, end: number) =>
    minuteToYPx(viewport, Math.min(end, viewport.endMinute), HOUR_HEIGHT) - top(start)

  return (
    <div className="relative flex w-full">
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

        <div className="grid grid-cols-7 gap-1.5" style={{ height }}>
          {columns.map((c) => {
            const dayEntries = entries.filter((e) => e.dayOfWeek === c.dayOfWeek)
            const dayBlocks = blocks.filter((b) => b.date === c.date)

            return (
              <div
                key={c.date}
                className={cn(
                  'relative overflow-hidden rounded-md',
                  c.isToday ? 'bg-surface-2/70 ring-1 ring-line-strong' : 'bg-surface/60',
                )}
              >
                {hours.slice(1).map((h) => (
                  <div
                    key={h}
                    className="pointer-events-none absolute inset-x-0 border-t border-line/60"
                    style={{ top: minuteToYPx(viewport, h * 60, HOUR_HEIGHT) }}
                  />
                ))}

                {/* Ce qui est déjà pris. Sombre, muet : sa place suffit à le dire. */}
                {dayEntries.map((e, i) => {
                  const h = span(e.startMinute, e.endMinute)
                  if (h <= 0) return null
                  return (
                    <div
                      key={`fixed-${i}`}
                      className="absolute inset-x-[3px] overflow-hidden rounded-[5px]"
                      style={{
                        top: top(e.startMinute),
                        height: h,
                        backgroundColor: e.color || CATEGORY_COLOR[e.categoryType],
                      }}
                      title={`${e.label} · ${clock(e.startMinute)} → ${clock(e.endMinute)}`}
                    >
                      <div className="px-1.5 py-1">
                        <span className="block truncate text-[10.5px] font-medium leading-tight text-fg-2">
                          {e.label}
                        </span>
                        {h > 30 && (
                          <span className="mt-0.5 block truncate font-mono text-[9.5px] tabular-nums text-fg-3">
                            {clock(e.startMinute)}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}

                {/* Ce que le moteur a posé. Clair, et il sait dire pourquoi. */}
                {dayBlocks.map((b, i) => {
                  const h = span(b.startMinute, b.endMinute)
                  if (h <= 0) return null
                  return (
                    <motion.button
                      key={b.id}
                      type="button"
                      onClick={() => setExplained(b)}
                      initial={reduce ? false : { opacity: 0, scaleY: 0.75 }}
                      animate={{ opacity: 1, scaleY: 1 }}
                      transition={{
                        duration: 0.32,
                        delay: 0.08 + i * 0.02,
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

                {c.isToday &&
                  nowMinute >= viewport.startMinute &&
                  nowMinute <= viewport.endMinute && (
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
