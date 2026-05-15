import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import type { ScheduleEntry, ScheduleState, TimeRule } from '@shared/schemas'
import {
  dateToMinuteOfDay,
  dateToMinuteOfWeek,
  getCurrentEntry,
  getNextChange,
  jsDateToDayOfWeek,
} from '@/lib/schedule-selectors'
import { formatCountdown, minuteToHHMM } from '@/lib/format-time'
import { iconByName } from '@/lib/rule-palette'
import { useLevelsStore } from '@/store/levels.store'

type Props = {
  rules: TimeRule[]
  entries: ScheduleEntry[]
  size?: number
}

// Géométrie SVG
const STROKE = 28
const TICK_OUTER = 8
const TICK_LABEL_OFFSET = 22

function polarToCartesian(cx: number, cy: number, radius: number, angleRad: number) {
  return { x: cx + radius * Math.cos(angleRad), y: cy + radius * Math.sin(angleRad) }
}

/**
 * Décrit un arc SVG entre deux angles (en radians, 0 = haut, sens horaire).
 * Si l'arc fait plus de 180°, on coupe en deux pour éviter les artefacts.
 */
function describeArc(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
): string {
  const start = polarToCartesian(cx, cy, radius, startAngle)
  const end = polarToCartesian(cx, cy, radius, endAngle)
  const sweep = endAngle - startAngle
  const largeArc = sweep > Math.PI ? 1 : 0
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`
}

/** 0..1440 → angle radian (0 = haut, croissant horaire). */
function minuteToAngle(minute: number): number {
  return -Math.PI / 2 + (minute / 1440) * Math.PI * 2
}

export function TimeCircle({ rules, entries, size = 480 }: Props) {
  const navigate = useNavigate()
  const objectives = useLevelsStore((s) => s.objectives)
  const [now, setNow] = useState(() => new Date())
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const id = setInterval(() => setNow(new Date()), 1_000)
    return () => clearInterval(id)
  }, [])

  const cx = size / 2
  const cy = size / 2
  const innerRadius = (size - STROKE) / 2 - 12
  const trackRadius = innerRadius
  const tickRadius = innerRadius + STROKE / 2 + 4

  const dow = jsDateToDayOfWeek(now)
  const minuteOfDay = dateToMinuteOfDay(now) + now.getSeconds() / 60

  const todayEntries = useMemo(
    () => entries.filter((e) => e.dayOfWeek === dow),
    [entries, dow],
  )
  const ruleById = useMemo(() => new Map(rules.map((r) => [r.id, r])), [rules])
  const objectiveByRuleId = useMemo(() => {
    const map = new Map<string, string>()
    for (const objective of objectives) {
      for (const ruleId of objective.linkedRuleIds) {
        map.set(ruleId, objective.id)
      }
    }
    return map
  }, [objectives])

  const state: ScheduleState = useMemo(() => ({ rules, entries }), [rules, entries])
  const current = getCurrentEntry(state, now)
  const next = getNextChange(state, now)

  // ms jusqu'au prochain changement
  let countdownMs: number | null = null
  if (next) {
    const nowMow = dateToMinuteOfWeek(now)
    let deltaMin = next.atMinuteOfWeek - nowMow
    if (deltaMin < 0) deltaMin += 10080
    countdownMs = deltaMin * 60_000 - now.getSeconds() * 1000
  }

  const cursorAngle = minuteToAngle(minuteOfDay)
  const cursorPos = polarToCartesian(cx, cy, trackRadius, cursorAngle)

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block">
        <defs>
          <radialGradient id="tc-bg" cx="50%" cy="50%" r="50%">
            <stop offset="60%" stopColor="hsl(220 16% 8%)" stopOpacity="0" />
            <stop offset="100%" stopColor="hsl(220 16% 6%)" stopOpacity="0.6" />
          </radialGradient>
        </defs>

        {/* halo de fond */}
        <circle cx={cx} cy={cy} r={innerRadius + STROKE} fill="url(#tc-bg)" />

        {/* anneau gris (track) */}
        <circle
          cx={cx}
          cy={cy}
          r={trackRadius}
          fill="none"
          stroke="hsl(220 14% 16%)"
          strokeWidth={STROKE}
          strokeLinecap="butt"
        />

        {/* arcs colorés du jour */}
        {todayEntries.map((e) => {
          const rule = ruleById.get(e.ruleId)
          if (!rule) return null
          const objectiveId = objectiveByRuleId.get(e.ruleId)
          const clickable =
            Boolean(objectiveId) &&
            !['sleep', 'school', 'work', 'commitment'].includes(rule.categoryType ?? '')
          const startA = minuteToAngle(e.startMinute)
          const endA = minuteToAngle(e.endMinute)
          // si arc proche de 360°, on dessine un cercle complet
          if (e.endMinute - e.startMinute >= 1439) {
            return (
              <circle
                key={e.id}
                cx={cx}
                cy={cy}
                r={trackRadius}
                fill="none"
                stroke={rule.color}
                strokeWidth={STROKE}
                opacity={0.9}
                role={clickable ? 'button' : undefined}
                tabIndex={clickable ? 0 : undefined}
                onClick={clickable ? () => navigate(`/objectives?objective=${objectiveId}`) : undefined}
                className={clickable ? 'cursor-pointer transition-opacity hover:opacity-100' : undefined}
              />
            )
          }
          return (
            <path
              key={e.id}
              d={describeArc(cx, cy, trackRadius, startA, endA)}
              fill="none"
              stroke={rule.color}
              strokeWidth={STROKE}
              strokeLinecap="butt"
              opacity={current?.entry.id === e.id ? 1 : 0.7}
              role={clickable ? 'button' : undefined}
              tabIndex={clickable ? 0 : undefined}
              onClick={clickable ? () => navigate(`/objectives?objective=${objectiveId}`) : undefined}
              onKeyDown={
                clickable
                  ? (event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        navigate(`/objectives?objective=${objectiveId}`)
                      }
                    }
                  : undefined
              }
              className={clickable ? 'cursor-pointer transition-opacity hover:opacity-100' : undefined}
              style={{
                transition: 'opacity 250ms',
              }}
            />
          )
        })}

        {/* tick marks 24h */}
        {Array.from({ length: 24 }, (_, h) => {
          const angle = minuteToAngle(h * 60)
          const inner = polarToCartesian(cx, cy, tickRadius, angle)
          const outer = polarToCartesian(cx, cy, tickRadius + TICK_OUTER, angle)
          const major = h % 6 === 0
          return (
            <line
              key={h}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke={major ? 'hsl(220 12% 50%)' : 'hsl(220 12% 30%)'}
              strokeWidth={major ? 2 : 1}
              strokeLinecap="round"
            />
          )
        })}

        {/* labels 0/6/12/18 */}
        {[0, 6, 12, 18].map((h) => {
          const angle = minuteToAngle(h * 60)
          const p = polarToCartesian(cx, cy, tickRadius + TICK_OUTER + TICK_LABEL_OFFSET, angle)
          return (
            <text
              key={h}
              x={p.x}
              y={p.y}
              fill="hsl(220 12% 60%)"
              fontSize="11"
              fontFamily="ui-monospace, SFMono-Regular, monospace"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {String(h).padStart(2, '0')}
            </text>
          )
        })}

        {/* Curseur — animé via Framer */}
        <motion.g
          initial={false}
          animate={{ rotate: mounted ? (minuteOfDay / 1440) * 360 : 0 }}
          transition={{ duration: mounted ? 0.25 : 0.25, ease: 'linear' }}
          style={{ originX: `${cx}px`, originY: `${cy}px` }}
        >
          <line
            x1={cx}
            y1={cy - trackRadius - STROKE / 2 - 2}
            x2={cx}
            y2={cy - trackRadius + STROKE / 2 + 2}
            stroke="white"
            strokeWidth={2}
            strokeLinecap="round"
          />
          <circle
            cx={cx}
            cy={cy - trackRadius}
            r={6}
            fill="white"
            stroke={current?.rule.color ?? 'hsl(220 8% 80%)'}
            strokeWidth={3}
          />
        </motion.g>
        {/* fallback static dot pour SSR/initial */}
        <circle cx={cursorPos.x} cy={cursorPos.y} r={0} fill="transparent" />
      </svg>

      {/* Centre : heure + label + countdown */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <div className="font-mono text-6xl font-light tabular-nums tracking-tight text-text-primary">
          {minuteToHHMM(Math.floor(minuteOfDay))}
        </div>
        {current ? (
          <CurrentChip rule={current.rule} />
        ) : (
          <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-bg-card px-3 py-1 text-xs uppercase tracking-wider text-text-muted">
            Temps libre
          </div>
        )}
        {countdownMs !== null && (
          <div className="mt-3 text-xs text-text-muted">
            <span className="text-text-secondary">{formatCountdown(countdownMs)}</span>{' '}
            {next?.rule ? (
              <>
                avant <span style={{ color: next.rule.color }}>{next.rule.name}</span>
              </>
            ) : (
              <>avant la fin</>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function CurrentChip({ rule }: { rule: TimeRule }) {
  const Icon = iconByName(rule.icon)
  return (
    <div
      className="mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wider text-white shadow-elevated"
      style={{ backgroundColor: rule.color }}
    >
      {Icon && <Icon size={12} strokeWidth={2.5} />}
      {rule.name}
    </div>
  )
}
