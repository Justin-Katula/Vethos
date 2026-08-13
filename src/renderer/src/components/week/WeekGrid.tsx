import { useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { CATEGORY_COLOR, BLOCK_COLOR, BLOCK_INK } from '@/lib/palette'
import { dayOfWeek } from '@/lib/planning/dates'
import { cn } from '@/lib/cn'
import type { PlacedBlock, ScheduleEntry } from '@/lib/planning/types'

/**
 * La semaine, en entier, sur un seul écran.
 *
 * Sept colonnes, une par jour. Le temps descend. Tout ce qui prend de la place
 * dans ta vie occupe une place ici, à l'échelle : ce qui est déjà pris (sommeil,
 * cours, travail, trajets) est sombre et muet, ce que le moteur a placé pour toi
 * est clair et lisible.
 *
 * C'est la seule vue qui répond à « à quoi vont ressembler mes journées ». Une
 * liste ne peut pas y répondre : elle dit ce qu'il y a, jamais où ça tombe ni
 * combien il reste entre deux choses.
 */

/** Hauteur d'une heure, en pixels. Toute la géométrie en découle. */
const HOUR = 44
const GUTTER = 52

type Props = {
  /** Dates de l'horizon, dans l'ordre. */
  dates: string[]
  /** Réalité fixe, tous jours confondus : filtrée par jour de semaine. */
  schedule: ScheduleEntry[]
  /** Blocs posés par le moteur, tous jours confondus. */
  blocks: PlacedBlock[]
  /** Date du jour, pour la marquer et y poser le trait de l'heure courante. */
  today: string
  nowMinute: number
  onSelect?: (block: PlacedBlock) => void
}

const DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

function hhmm(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
}

export function WeekGrid({ dates, schedule, blocks, today, nowMinute, onSelect }: Props) {
  const reduce = useReducedMotion()

  // La grille ne montre que les heures qui portent quelque chose. Afficher
  // minuit à minuit quand rien ne commence avant 7 h, c'est demander de
  // parcourir sept heures de vide avant d'atteindre l'information.
  const [fromHour, toHour] = useMemo(() => {
    const starts = [
      ...blocks.map((b) => b.startMinute),
      ...schedule.filter((e) => e.categoryType !== 'sleep').map((e) => e.startMinute),
    ]
    const ends = [
      ...blocks.map((b) => b.endMinute),
      ...schedule.filter((e) => e.categoryType !== 'sleep').map((e) => e.endMinute),
    ]
    // L'heure courante entre toujours dans la fenêtre : un trait « maintenant »
    // qui disparaît le soir parce que plus rien n'est planifié après 22 h est
    // exactement le moment où on a le plus besoin de savoir où on en est.
    const nowHour = Math.floor(nowMinute / 60)
    if (starts.length === 0) return [Math.min(6, nowHour), Math.max(24, nowHour + 1)]
    const lo = Math.max(0, Math.min(Math.floor(Math.min(...starts) / 60) - 1, nowHour))
    const hi = Math.min(24, Math.max(Math.ceil(Math.max(...ends) / 60) + 1, nowHour + 1))
    return [lo, Math.max(hi, lo + 6)]
  }, [blocks, schedule, nowMinute])

  const spanMinutes = (toHour - fromHour) * 60
  const height = (toHour - fromHour) * HOUR

  /** Convertit une minute absolue en position verticale, bornée à la fenêtre. */
  const y = (minute: number) => ((minute - fromHour * 60) / spanMinutes) * height

  const hours = Array.from({ length: toHour - fromHour + 1 }, (_, i) => fromHour + i)

  return (
    <div className="flex w-full">
      {/* Colonne des heures. Fixe, jamais scrollée séparément. */}
      <div className="relative shrink-0" style={{ width: GUTTER, height }}>
        {hours.map((h) => (
          <div
            key={h}
            className="absolute right-3 -translate-y-1/2 font-mono text-[10.5px] tabular-nums text-fg-3"
            style={{ top: y(h * 60) }}
          >
            {String(h).padStart(2, '0')}
          </div>
        ))}
      </div>

      <div className="grid min-w-0 flex-1 grid-cols-7 gap-1.5">
        {dates.map((date, dayIndex) => {
          const dow = dayOfWeek(date)
          const isToday = date === today
          const dayEntries = schedule.filter((e) => e.dayOfWeek === dow)
          const dayBlocks = blocks.filter((b) => b.date === date)

          return (
            <motion.div
              key={date}
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: dayIndex * 0.045, ease: [0.22, 1, 0.36, 1] }}
              className="min-w-0"
            >
              <div className="mb-2 flex items-baseline gap-1.5 px-0.5">
                <span
                  className={cn(
                    'text-[11px] font-medium',
                    isToday ? 'text-fg' : 'text-fg-3',
                  )}
                >
                  {DAY_NAMES[dow]}
                </span>
                <span
                  className={cn(
                    'font-mono text-[10.5px] tabular-nums',
                    isToday ? 'text-fg-2' : 'text-fg-3',
                  )}
                >
                  {date.slice(8)}
                </span>
              </div>

              <div
                className={cn(
                  'relative overflow-hidden rounded-md',
                  isToday ? 'bg-surface-2/70 ring-1 ring-line-strong' : 'bg-surface/60',
                )}
                style={{ height }}
              >
                {/* Filets horaires : assez visibles pour situer, assez discrets
                    pour disparaître dès qu'un bloc les recouvre. */}
                {hours.slice(1, -1).map((h) => (
                  <div
                    key={h}
                    className="absolute inset-x-0 border-t border-line/60"
                    style={{ top: y(h * 60) }}
                  />
                ))}

                {/* Ce qui est déjà pris. Sombre, sans étiquette : sa place
                    suffit à le dire, et le nommer volerait de la lisibilité
                    à ce qui compte. */}
                {dayEntries.map((entry, i) => {
                  const top = y(entry.startMinute)
                  const h = y(entry.endMinute) - top
                  if (h <= 0) return null
                  return (
                    <div
                      key={`fixed-${i}`}
                      className="absolute inset-x-0"
                      style={{
                        top: Math.max(0, top),
                        height: Math.max(0, Math.min(h, height - Math.max(0, top))),
                        backgroundColor: CATEGORY_COLOR[entry.categoryType],
                      }}
                      title={`${entry.label} · ${hhmm(entry.startMinute)} → ${hhmm(entry.endMinute)}`}
                    />
                  )
                })}

                {/* Ce que le moteur a placé pour toi. */}
                {dayBlocks.map((block, i) => {
                  const top = y(block.startMinute)
                  const h = y(block.endMinute) - top
                  if (h <= 0) return null
                  const tall = h >= 26
                  return (
                    <motion.button
                      key={block.id}
                      type="button"
                      onClick={() => onSelect?.(block)}
                      initial={reduce ? false : { opacity: 0, scaleY: 0.7 }}
                      animate={{ opacity: 1, scaleY: 1 }}
                      transition={{
                        duration: 0.34,
                        delay: 0.12 + dayIndex * 0.045 + i * 0.02,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                      whileHover={reduce ? undefined : { scale: 1.035, zIndex: 20 }}
                      className="absolute inset-x-[3px] origin-top overflow-hidden rounded-[5px] px-1.5 py-1 text-left"
                      style={{
                        top: Math.max(0, top),
                        height: Math.max(4, Math.min(h - 2, height - Math.max(0, top))),
                        backgroundColor: block.color || BLOCK_COLOR[block.kind],
                        color: BLOCK_INK[block.kind],
                      }}
                      title={`${block.label} · ${hhmm(block.startMinute)} → ${hhmm(block.endMinute)}`}
                    >
                      <span className="block truncate text-[10.5px] font-medium leading-tight">
                        {block.label}
                      </span>
                      {tall && (
                        <span className="mt-0.5 block truncate font-mono text-[9.5px] tabular-nums opacity-70">
                          {hhmm(block.startMinute)}
                        </span>
                      )}
                    </motion.button>
                  )
                })}

                {/* L'heure courante, uniquement sur aujourd'hui. */}
                {isToday && nowMinute >= fromHour * 60 && nowMinute <= toHour * 60 && (
                  <motion.div
                    initial={reduce ? false : { opacity: 0, scaleX: 0.4 }}
                    animate={{ opacity: 1, scaleX: 1 }}
                    transition={{ duration: 0.5, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
                    className="pointer-events-none absolute inset-x-0 z-30 h-px bg-accent"
                    style={{ top: y(nowMinute) }}
                  >
                    <span className="absolute -left-px -top-[3px] h-[7px] w-[7px] rounded-full bg-accent" />
                  </motion.div>
                )}
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
