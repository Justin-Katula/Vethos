import { useEffect, useMemo } from 'react'
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion'
import { BLOCK_COLOR, CATEGORY_COLOR, entryFill } from '@/lib/palette'
import { useResolvedTheme } from '@/lib/use-theme'

import type { PlacedBlock, ScheduleEntry } from '@shared/planning/types'

/** Cadran 24 h : obligations dehors, engagements dedans, present en rouge. */

const VIEWBOX = 280
const C = VIEWBOX / 2
const R_FIXED = 116
const W_FIXED = 11
const R_PLAN = 94
// Une bande posée dans une rainure VISIBLE se lit comme une graduation ; c'est
// la rainure qui fait le travail, pas la finesse de la bande. Le rail vide est
// donc dessiné plus franchement qu'avant, ce qui permet à la bande de
// s'épaissir sans redevenir le pâté blanc d'origine.
const W_PLAN = 9
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

/**
 * Coupe un intervalle [start, end] à `now` : la portion déjà passée s'assombrit,
 * exactement comme tout ce qui est déjà pris (palette.ts) — ce qui est derrière
 * l'aiguille ne t'appartient plus à décider. `now` à `null` (jour affiché ≠
 * aujourd'hui) laisse l'intervalle entier en pleine clarté : rien n'est «passé»
 * sur un jour qu'on ne vit pas encore ou plus.
 */
function splitAtNow(
  start: number,
  end: number,
  now: number | null,
): { past: [number, number] | null; future: [number, number] | null } {
  if (now === null) return { past: null, future: [start, end] }
  const cut = Math.max(start, Math.min(end, now))
  return {
    past: cut > start ? [start, cut] : null,
    future: end > cut ? [cut, end] : null,
  }
}

/** L'opacité d'un bloc posé selon sa nature. La tâche à échéance brûle le plus fort. */
const PLAN_OPACITY: Record<PlacedBlock['kind'], number> = {
  task: 1,
  objective: 0.72,
  ancre: 0.46,
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
  const theme = useResolvedTheme()
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

  // Les arcs posés, découpés à « maintenant » une seule fois.
  const planArcs = useMemo(
    () =>
      planned.flatMap((b) => {
        const { past, future } = splitAtNow(b.startMinute, b.endMinute, nowMinute)
        const base = PLAN_OPACITY[b.kind]
        const out: { key: string; d: string; opacity: number; color: string }[] = []
        if (past)
          out.push({
            key: `${b.id}-p`,
            d: arc(R_PLAN, past[0], past[1]),
            opacity: base * 0.34,
            color: BLOCK_COLOR[b.kind],
          })
        if (future)
          out.push({
            key: `${b.id}-f`,
            d: arc(R_PLAN, future[0], future[1]),
            opacity: base,
            color: BLOCK_COLOR[b.kind],
          })
        return out
      }),
    [planned, nowMinute],
  )

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
            stroke={t.major ? 'var(--text-2)' : 'var(--line-strong)'}
            strokeWidth={t.major ? 2.5 : 1}
          />
        ))}

        <circle
          cx={C}
          cy={C}
          r={R_FIXED}
          fill="none"
          stroke="var(--line-strong)"
          strokeWidth={W_FIXED}
          opacity={0.38}
        />
        <circle
          cx={C}
          cy={C}
          r={R_PLAN}
          fill="none"
          stroke="var(--line-strong)"
          strokeWidth={W_PLAN + 3}
          opacity={0.2}
        />

        {/* Bande extérieure : ce qui est déjà pris. Le rocher. Sa portion déjà
            vécue s'assombrit encore plus — déjà sombre, elle disparaît presque. */}
        {fixed.map((e, i) => {
          const { past, future } = splitAtNow(e.startMinute, e.endMinute, nowMinute)
          const key = `f-${e.dayOfWeek}-${e.startMinute}-${i}`
          return (
            <g key={key}>
              {past && (
                <path
                  d={arc(R_FIXED, past[0], past[1])}
                  fill="none"
                  stroke={entryFill(CATEGORY_COLOR[e.categoryType], theme)}
                  strokeWidth={W_FIXED}
                  opacity={0.4}
                />
              )}
              {future && (
                <path
                  d={arc(R_FIXED, future[0], future[1])}
                  fill="none"
                  stroke={entryFill(CATEGORY_COLOR[e.categoryType], theme)}
                  strokeWidth={W_FIXED}
                />
              )}
            </g>
          )
        })}

        {planArcs.map((a) => (
          <path
            key={a.key}
            d={a.d}
            fill="none"
            stroke={a.color}
            strokeWidth={W_PLAN}
            strokeLinecap="butt"
            opacity={a.opacity}
          />
        ))}

        {/* L'aiguille de Hilfiker. Elle ne dit qu'une chose : maintenant. */}
        {nowMinute !== null && (
          <g>
            <motion.path
              d={handD}
              stroke="var(--text)"
              strokeWidth={1.6}
              strokeLinecap="butt"
              opacity={0.64}
            />
            <motion.circle cx={discX} cy={discY} r={5.5} fill="var(--accent)" />
            <circle cx={C} cy={C} r={3} fill="var(--text-3)" />
          </g>
        )}
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center px-16 text-center">
        {children}
      </div>
    </div>
  )
}
