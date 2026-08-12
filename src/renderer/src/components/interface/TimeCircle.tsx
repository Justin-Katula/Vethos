import { useMemo } from 'react'
import { motion } from 'framer-motion'
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
 * L'aiguille dit où tu en es. Rien d'autre n'est dessiné.
 */

const SIZE = 260
const CENTER = SIZE / 2
const OUTER_RADIUS = 108
const OUTER_STROKE = 16
const INNER_RADIUS = 84
const INNER_STROKE = 12

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

export type TimeCircleProps = {
  /** Réalité fixe du jour affiché. */
  entries: ScheduleEntry[]
  /** Blocs posés par le moteur pour ce jour. */
  blocks: PlacedBlock[]
  /** Minute courante, ou null si le jour affiché n'est pas aujourd'hui. */
  nowMinute: number | null
  children?: React.ReactNode
}

export function TimeCircle({ entries, blocks, nowMinute, children }: TimeCircleProps) {
  const fixed = useMemo(
    () => [...entries].sort((a, b) => a.startMinute - b.startMinute),
    [entries],
  )
  const planned = useMemo(() => [...blocks].sort((a, b) => a.startMinute - b.startMinute), [blocks])
  const nowAngle = nowMinute === null ? null : minuteToAngle(nowMinute)

  return (
    <div className="relative" style={{ width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="absolute inset-0">
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

        {/* Anneau extérieur — ce qui est déjà pris. */}
        {fixed.map((entry, i) => (
          <motion.path
            key={`fixed-${entry.dayOfWeek}-${entry.startMinute}-${i}`}
            d={arcPath(OUTER_RADIUS, entry.startMinute, entry.endMinute)}
            fill="none"
            stroke={CATEGORY_COLOR[entry.categoryType]}
            strokeWidth={OUTER_STROKE}
            strokeLinecap="butt"
            initial={{ opacity: 0 }}
            animate={{ opacity: entry.categoryType === 'sleep' ? 1 : 0.78 }}
            transition={{ duration: 0.4, delay: i * 0.015 }}
          />
        ))}

        {/* Anneau intérieur — ce que l'application a posé. */}
        {planned.map((block, i) => (
          <motion.path
            key={block.id}
            d={arcPath(INNER_RADIUS, block.startMinute, block.endMinute)}
            fill="none"
            stroke={block.color}
            strokeWidth={INNER_STROKE}
            strokeLinecap="round"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.95 }}
            transition={{ duration: 0.4, delay: 0.1 + i * 0.03 }}
          />
        ))}

        {/* L'aiguille : où tu en es, maintenant. */}
        {nowAngle !== null && (
          <g>
            <line
              x1={polar(INNER_RADIUS - INNER_STROKE / 2 - 6, nowAngle).x}
              y1={polar(INNER_RADIUS - INNER_STROKE / 2 - 6, nowAngle).y}
              x2={polar(OUTER_RADIUS + OUTER_STROKE / 2 + 4, nowAngle).x}
              y2={polar(OUTER_RADIUS + OUTER_STROKE / 2 + 4, nowAngle).y}
              stroke="var(--text-primary)"
              strokeWidth={1.5}
              strokeLinecap="round"
            />
            <circle
              cx={polar(OUTER_RADIUS + OUTER_STROKE / 2 + 4, nowAngle).x}
              cy={polar(OUTER_RADIUS + OUTER_STROKE / 2 + 4, nowAngle).y}
              r={3}
              fill="var(--text-primary)"
            />
          </g>
        )}
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center px-10 text-center">
        {children}
      </div>
    </div>
  )
}
