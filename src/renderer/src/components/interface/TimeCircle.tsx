import { useEffect, useMemo } from 'react'
import { animate, motion, useMotionValue, useTransform } from 'framer-motion'
import { CATEGORY_COLOR } from '@/lib/palette'
import type { PlacedBlock, ScheduleEntry } from '@/lib/planning/types'

/**
 * Les 24 heures d'une journée, en un seul objet.
 *
 * Deux anneaux concentriques, et la lecture est immédiate :
 *   — l'anneau extérieur, sourd, c'est ce qui est déjà pris (sommeil, cours,
 *     travail, trajets). Ce sur quoi tu ne peux rien.
 *   — l'anneau intérieur, clair, c'est ce que l'application a posé pour toi.
 *     Ce qui t'appartient.
 *
 * Les arcs se dessinent au lieu d'apparaître, et l'aiguille balaie la journée
 * depuis minuit jusqu'à maintenant : on voit le temps déjà consommé au lieu de
 * le lire.
 */

const VIEWBOX = 260
const CENTER = VIEWBOX / 2
const OUTER_RADIUS = 108
const OUTER_STROKE = 15
const INNER_RADIUS = 84
const INNER_STROKE = 11

/** 0 h en haut, sens horaire. */
function minuteToAngle(minute: number): number {
  return -Math.PI / 2 + (minute / 1440) * Math.PI * 2
}

function polar(radius: number, angle: number) {
  return { x: CENTER + radius * Math.cos(angle), y: CENTER + radius * Math.sin(angle) }
}

function arcPath(radius: number, startMinute: number, endMinute: number): string {
  const start = minuteToAngle(startMinute)
  // Un arc complet ne peut pas se dessiner d'un seul trait : on le referme
  // juste avant la fin pour éviter que SVG ne le réduise à un point.
  const end = minuteToAngle(Math.min(endMinute, startMinute + 1439.5))
  const a = polar(radius, start)
  const b = polar(radius, end)
  const largeArc = end - start > Math.PI ? 1 : 0
  return `M ${a.x} ${a.y} A ${radius} ${radius} 0 ${largeArc} 1 ${b.x} ${b.y}`
}

const DRAW = { duration: 0.9, ease: [0.16, 1, 0.3, 1] as const }

export type TimeCircleProps = {
  entries: ScheduleEntry[]
  blocks: PlacedBlock[]
  /** Minute courante, ou null si le jour affiché n'est pas aujourd'hui. */
  nowMinute: number | null
  /** Diamètre rendu, en pixels. Le tracé reste défini dans son viewBox. */
  size?: number
  children?: React.ReactNode
}

export function TimeCircle({ entries, blocks, nowMinute, size = 320, children }: TimeCircleProps) {
  const fixed = useMemo(() => [...entries].sort((a, b) => a.startMinute - b.startMinute), [entries])
  const planned = useMemo(() => [...blocks].sort((a, b) => a.startMinute - b.startMinute), [blocks])

  // L'aiguille balaie depuis minuit : un ressort, pas une durée fixe.
  const sweep = useMotionValue(0)
  useEffect(() => {
    if (nowMinute === null) return
    const controls = animate(sweep, 1, { type: 'spring', stiffness: 45, damping: 16, restDelta: 0.001 })
    return () => controls.stop()
  }, [sweep, nowMinute])

  const handPath = useTransform(sweep, (progress) => {
    if (nowMinute === null) return ''
    const angle = minuteToAngle(nowMinute * progress)
    const from = polar(INNER_RADIUS - INNER_STROKE / 2 - 7, angle)
    const to = polar(OUTER_RADIUS + OUTER_STROKE / 2 + 5, angle)
    return `M ${from.x} ${from.y} L ${to.x} ${to.y}`
  })
  const handX = useTransform(sweep, (p) =>
    nowMinute === null ? 0 : polar(OUTER_RADIUS + OUTER_STROKE / 2 + 5, minuteToAngle(nowMinute * p)).x,
  )
  const handY = useTransform(sweep, (p) =>
    nowMinute === null ? 0 : polar(OUTER_RADIUS + OUTER_STROKE / 2 + 5, minuteToAngle(nowMinute * p)).y,
  )

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
        className="absolute inset-0 overflow-visible"
      >
        {/* Rail : les 24 heures, toujours visibles même vides. */}
        <circle
          cx={CENTER}
          cy={CENTER}
          r={OUTER_RADIUS}
          fill="none"
          stroke="var(--border-subtle)"
          strokeWidth={OUTER_STROKE}
        />
        <circle
          cx={CENTER}
          cy={CENTER}
          r={INNER_RADIUS}
          fill="none"
          stroke="rgba(216,216,216,0.05)"
          strokeWidth={INNER_STROKE}
        />

        {/* Anneau extérieur : ce qui est déjà pris. */}
        {fixed.map((entry, i) => (
          <motion.path
            key={`fixed-${entry.dayOfWeek}-${entry.startMinute}-${i}`}
            d={arcPath(OUTER_RADIUS, entry.startMinute, entry.endMinute)}
            fill="none"
            stroke={CATEGORY_COLOR[entry.categoryType]}
            strokeWidth={OUTER_STROKE}
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: entry.categoryType === 'sleep' ? 1 : 0.8 }}
            transition={{ ...DRAW, delay: i * 0.06 }}
          />
        ))}

        {/* Anneau intérieur : ce que l'application a posé. */}
        {planned.map((block, i) => (
          <motion.path
            key={block.id}
            d={arcPath(INNER_RADIUS, block.startMinute, block.endMinute)}
            fill="none"
            stroke={block.color}
            strokeWidth={INNER_STROKE}
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 0.95 }}
            transition={{ ...DRAW, delay: 0.25 + i * 0.07 }}
          />
        ))}

        {/* L'aiguille : où tu en es, maintenant. */}
        {nowMinute !== null && (
          <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
            <motion.path d={handPath} stroke="var(--text-primary)" strokeWidth={1.5} strokeLinecap="round" />
            <motion.circle cx={handX} cy={handY} r={3.5} fill="var(--text-primary)" />
          </motion.g>
        )}
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center px-12 text-center">
        {children}
      </div>
    </div>
  )
}
