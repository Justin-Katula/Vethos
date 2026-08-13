import { useEffect, useMemo } from 'react'
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion'
import { CATEGORY_COLOR } from '@/lib/palette'
import type { PlacedBlock, ScheduleEntry } from '@/lib/planning/types'

/**
 * L'HORLOGE DU HALL
 *
 * Le cadran de Hilfiker, ramené aux 24 heures d'une journée. Deux bandes
 * d'émail posées sur le cadran :
 *   - la bande extérieure, sourde, c'est ce qui est déjà pris ;
 *   - la bande intérieure, claire, c'est ce que le moteur a posé pour toi.
 *
 * L'aiguille est rouge, avec le disque de Hilfiker à sa pointe. C'est le seul
 * rouge du base, et il ne dit qu'une chose : maintenant.
 *
 * LE MOMENT CHORÉGRAPHIÉ : au chargement, l'aiguille balaie depuis minuit
 * jusqu'à l'heure courante, marque un temps d'arrêt, puis se pose. C'est le
 * stop-to-go de l'horloge suisse, et c'est la seule animation orchestrée de
 * l'application : on voit le temps déjà consommé au lieu de le lire.
 */

const VIEWBOX = 280
const C = VIEWBOX / 2
const R_FIXED = 116
const W_FIXED = 13
const R_PLAN = 94
// Une bande fine posée dans une rainure visible se lit comme une graduation.
// Épaisse et flottant sur un line à moitié effacé, un bloc isolé devenait un
// pâté blanc au lieu d'un arc de précision.
const W_PLAN = 7
const R_TICK = 128

/** 0 h en haut, sens horaire. */
function angleOf(minute: number): number {
  return -Math.PI / 2 + (minute / 1440) * Math.PI * 2
}

function polar(radius: number, angle: number) {
  return { x: C + radius * Math.cos(angle), y: C + radius * Math.sin(angle) }
}

function arc(radius: number, from: number, to: number): string {
  const a0 = angleOf(from)
  const a1 = angleOf(Math.min(to, from + 1439.4))
  const p0 = polar(radius, a0)
  const p1 = polar(radius, a1)
  return `M ${p0.x} ${p0.y} A ${radius} ${radius} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p1.x} ${p1.y}`
}

export function HallClock({
  entries,
  blocks,
  nowMinute,
  size = 340,
  children,
}: {
  entries: ScheduleEntry[]
  blocks: PlacedBlock[]
  /** Minute courante, ou null quand le jour affiché n'est pas aujourd'hui. */
  nowMinute: number | null
  size?: number
  children?: React.ReactNode
}) {
  const reduce = useReducedMotion()
  const fixed = useMemo(() => [...entries].sort((a, b) => a.startMinute - b.startMinute), [entries])
  const planned = useMemo(() => [...blocks].sort((a, b) => a.startMinute - b.startMinute), [blocks])

  // Les 24 graduations. Longues aux quatre quarts du jour, comme les batons
  // des cinq minutes sur le cadran d'origine.
  const ticks = useMemo(
    () =>
      Array.from({ length: 24 }, (_, h) => {
        const a = angleOf(h * 60)
        const major = h % 6 === 0
        const inner = polar(R_TICK - (major ? 13 : 6), a)
        const outer = polar(R_TICK, a)
        return { key: h, major, x1: inner.x, y1: inner.y, x2: outer.x, y2: outer.y }
      }),
    [],
  )

  const sweep = useMotionValue(reduce ? 1 : 0)
  useEffect(() => {
    if (nowMinute === null || reduce) return
    // Balayage, puis temps d'arret, puis pose : le stop-to-go.
    const run = animate(sweep, 1, { duration: 1.6, ease: [0.4, 0, 0.1, 1] })
    return () => run.stop()
  }, [sweep, nowMinute, reduce])

  const handAngle = useTransform(sweep, (p) => (nowMinute === null ? 0 : angleOf(nowMinute * p)))
  const handD = useTransform(handAngle, (a) => {
    const tail = polar(-14, a)
    const tip = polar(R_FIXED + W_FIXED / 2 + 6, a)
    return `M ${tail.x} ${tail.y} L ${tip.x} ${tip.y}`
  })
  const discX = useTransform(handAngle, (a) => polar(R_FIXED + W_FIXED / 2 + 2, a).x)
  const discY = useTransform(handAngle, (a) => polar(R_FIXED + W_FIXED / 2 + 2, a).y)

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
        className="absolute inset-0"
      >
        {/* Les graduations du cadran. */}
        {ticks.map((t) => (
          <line
            key={t.key}
            x1={t.x1}
            y1={t.y1}
            x2={t.x2}
            y2={t.y2}
            stroke={t.major ? 'var(--fg-2)' : 'var(--line-strong)'}
            strokeWidth={t.major ? 2.5 : 1}
          />
        ))}

        {/* Les deux rails vides : le cadran reste lisible même sans rien dessus. */}
        <circle cx={C} cy={C} r={R_FIXED} fill="none" stroke="var(--line)" strokeWidth={W_FIXED} />
        <circle cx={C} cy={C} r={R_PLAN} fill="none" stroke="var(--line)" strokeWidth={W_PLAN} />

        {/* Bande extérieure : ce qui est déjà pris. */}
        {fixed.map((e, i) => (
          <path
            key={`f-${e.dayOfWeek}-${e.startMinute}-${i}`}
            d={arc(R_FIXED, e.startMinute, e.endMinute)}
            fill="none"
            stroke={CATEGORY_COLOR[e.categoryType]}
            strokeWidth={W_FIXED}
          />
        ))}

        {/* Bande intérieure : ce que le moteur a posé. */}
        {planned.map((b) => (
          <path
            key={b.id}
            d={arc(R_PLAN, b.startMinute, b.endMinute)}
            fill="none"
            stroke={b.color}
            strokeWidth={W_PLAN}
          />
        ))}

        {/* L'aiguille de Hilfiker : le seul rouge du cadran. */}
        {nowMinute !== null && (
          <g>
            <motion.path d={handD} stroke="var(--accent)" strokeWidth={2.5} strokeLinecap="butt" />
            <motion.circle cx={discX} cy={discY} r={7} fill="var(--accent)" />
            <circle cx={C} cy={C} r={4} fill="var(--accent)" />
          </g>
        )}
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center px-16 text-center">
        {children}
      </div>
    </div>
  )
}
