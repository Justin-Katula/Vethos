import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ScheduleEntry, ScheduleState, TimeRule } from '@shared/schemas'
import {
  dateToMinuteOfDay,
  dateToMinuteOfWeek,
  getCurrentEntry,
  getNextChange,
  jsDateToDayOfWeek,
} from '@/lib/schedule-selectors'
import { formatCountdown, minuteToClockLabel } from '@/lib/format-time'
import { iconByName } from '@/lib/rule-palette'
import { useLevelsStore } from '@/store/levels.store'
import { useTasksStore } from '@/store/tasks.store'

type Props = {
  rules: TimeRule[]
  entries: ScheduleEntry[]
  size?: number
}

// Géométrie SVG
const STROKE = 28
const TICK_OUTER = 8
const TICK_LABEL_OFFSET = 22
const ARC_JOIN_OVERLAP_MINUTES = 0.5

const URGENCY_STYLES = {
  critical: { stroke: '#ef4444' },
  warning: { stroke: '#FF8A00' },
} as const

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

function displayColorForRule(rule: TimeRule): { color: string; opacity: number } {
  if (rule.categoryType === 'sleep') return { color: '#1E3A8A', opacity: 1 }
  if (rule.categoryType === 'school') return { color: '#FFFFFF', opacity: 0.7 }
  if (rule.categoryType === 'work') return { color: '#3BA3FF', opacity: 1 }
  if (rule.categoryType === 'free') return { color: 'transparent', opacity: 1 }
  return { color: rule.color, opacity: 0.9 }
}

function localDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function daysBetweenLocalDates(fromDateStr: string, toDateStr: string): number {
  const [fromYear, fromMonth, fromDay] = fromDateStr.split('-').map(Number) as [
    number,
    number,
    number,
  ]
  const [toYear, toMonth, toDay] = toDateStr.split('-').map(Number) as [number, number, number]
  const from = new Date(fromYear, fromMonth - 1, fromDay)
  const to = new Date(toYear, toMonth - 1, toDay)
  return Math.ceil((to.getTime() - from.getTime()) / 86_400_000)
}

function useSecondNow(): Date {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1_000)
    return () => clearInterval(id)
  }, [])

  return now
}

function useMinuteNow(): Date {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null
    const delay = 60_000 - (Date.now() % 60_000)
    const timeout = setTimeout(() => {
      setNow(new Date())
      interval = setInterval(() => setNow(new Date()), 60_000)
    }, delay)

    return () => {
      clearTimeout(timeout)
      if (interval) clearInterval(interval)
    }
  }, [])

  return now
}

export function TimeCircle({ rules, entries, size = 480 }: Props) {
  const navigate = useNavigate()
  const objectives = useLevelsStore((s) => s.objectives)
  const tasks = useTasksStore((s) => s.tasks)
  const now = useMinuteNow()

  const cx = size / 2
  const cy = size / 2
  const innerRadius = (size - STROKE) / 2 - 12
  const trackRadius = innerRadius
  const tickRadius = innerRadius + STROKE / 2 + 4

  const dow = jsDateToDayOfWeek(now)
  const minuteOfDay = dateToMinuteOfDay(now)
  const todayStr = localDateKey(now)

  const todayEntries = useMemo(() => entries.filter((e) => e.dayOfWeek === dow), [entries, dow])
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
  const urgencyByObjectiveId = useMemo(() => {
    const map = new Map<string, keyof typeof URGENCY_STYLES>()
    for (const task of tasks) {
      if (task.status !== 'active' || !task.linkedObjectiveId) continue
      const daysLeft = daysBetweenLocalDates(todayStr, task.deadline)
      const urgency = daysLeft <= 1 ? 'critical' : daysLeft <= 3 ? 'warning' : null
      if (!urgency) continue
      const previous = map.get(task.linkedObjectiveId)
      if (!previous || urgency === 'critical') {
        map.set(task.linkedObjectiveId, urgency)
      }
    }
    return map
  }, [tasks, todayStr])

  const state: ScheduleState = useMemo(() => ({ rules, entries }), [rules, entries])
  const current = getCurrentEntry(state, now)
  const currentEntryId = current?.entry.id

  const segments = useMemo(
    () =>
      todayEntries.map((e) => {
        const rule = ruleById.get(e.ruleId)
        if (!rule) return null
        const objectiveId = objectiveByRuleId.get(e.ruleId)
        const urgency = objectiveId ? urgencyByObjectiveId.get(objectiveId) : undefined
        const urgencyStroke = urgency ? URGENCY_STYLES[urgency].stroke : null
        const display = displayColorForRule(rule)
        const clickable =
          Boolean(objectiveId) &&
          !['sleep', 'school', 'work', 'commitment'].includes(rule.categoryType ?? '')
        const startMinute = Math.max(0, e.startMinute - ARC_JOIN_OVERLAP_MINUTES)
        const endMinute = Math.min(1440, e.endMinute + ARC_JOIN_OVERLAP_MINUTES)
        const startA = minuteToAngle(startMinute)
        const endA = minuteToAngle(endMinute)

        if (e.endMinute - e.startMinute >= 1439) {
          return (
            <g
              key={e.id}
              role={clickable ? 'button' : undefined}
              tabIndex={clickable ? 0 : undefined}
              onClick={
                clickable ? () => navigate(`/objectives?objective=${objectiveId}`) : undefined
              }
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
              className={clickable ? 'cursor-pointer' : undefined}
            >
              {urgencyStroke && (
                <circle
                  cx={cx}
                  cy={cy}
                  r={trackRadius}
                  fill="none"
                  stroke={urgencyStroke}
                  strokeWidth={STROKE + 8}
                  strokeLinecap="round"
                  opacity={0.9}
                  pointerEvents="none"
                />
              )}
              <circle
                cx={cx}
                cy={cy}
                r={trackRadius}
                fill="none"
                stroke={display.color}
                strokeWidth={STROKE}
                strokeLinecap="round"
                opacity={display.opacity}
                className={clickable ? 'transition-opacity hover:opacity-100' : undefined}
                pointerEvents={clickable ? 'stroke' : undefined}
              />
            </g>
          )
        }

        const pathD = describeArc(cx, cy, trackRadius, startA, endA)
        return (
          <g
            key={e.id}
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
            className={clickable ? 'cursor-pointer' : undefined}
          >
            {urgencyStroke && (
              <path
                d={pathD}
                fill="none"
                stroke={urgencyStroke}
                strokeWidth={STROKE + 8}
                strokeLinecap="round"
                opacity={0.85}
                pointerEvents="none"
              />
            )}
            <path
              d={pathD}
              fill="none"
              stroke={display.color}
              strokeWidth={STROKE}
              strokeLinecap="round"
              opacity={currentEntryId === e.id ? 1 : Math.min(display.opacity, 0.7)}
              className={clickable ? 'transition-opacity hover:opacity-100' : undefined}
              pointerEvents={clickable ? 'stroke' : undefined}
              style={{
                transition: 'opacity 250ms',
              }}
            />
          </g>
        )
      }),
    [
      currentEntryId,
      cx,
      cy,
      navigate,
      objectiveByRuleId,
      ruleById,
      todayEntries,
      trackRadius,
      urgencyByObjectiveId,
    ],
  )

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
          strokeLinecap="round"
        />

        {/* arcs colorés du jour */}
        {segments}

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

        <TimeCircleNeedle cx={cx} cy={cy} trackRadius={trackRadius} />
      </svg>

      {/* Centre : heure + label + countdown */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <div className="font-mono text-6xl font-light tabular-nums tracking-tight text-text-primary">
          {minuteToClockLabel(Math.floor(minuteOfDay))}
        </div>
        {current ? (
          <CurrentChip rule={current.rule} />
        ) : (
          <div className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-bg-card px-3 py-1 text-xs uppercase tracking-wider text-text-muted">
            Temps libre
          </div>
        )}
        <CountdownText state={state} />
      </div>
    </div>
  )
}

function TimeCircleNeedle({
  cx,
  cy,
  trackRadius,
}: {
  cx: number
  cy: number
  trackRadius: number
}): JSX.Element {
  const now = useSecondNow()
  const minuteOfDay = dateToMinuteOfDay(now) + now.getSeconds() / 60 + now.getMilliseconds() / 60000
  const angle = minuteToAngle(minuteOfDay)
  const inner = polarToCartesian(cx, cy, trackRadius - STROKE / 2 - 2, angle)
  const outer = polarToCartesian(cx, cy, trackRadius + STROKE / 2 + 2, angle)

  return (
    <line
      x1={inner.x}
      y1={inner.y}
      x2={outer.x}
      y2={outer.y}
      stroke="white"
      strokeWidth={2}
      strokeLinecap="round"
      pointerEvents="none"
    />
  )
}

function CountdownText({ state }: { state: ScheduleState }): JSX.Element | null {
  const now = useSecondNow()
  const next = getNextChange(state, now)

  if (!next) return null

  const nowMow = dateToMinuteOfWeek(now)
  let deltaMin = next.atMinuteOfWeek - nowMow
  if (deltaMin < 0) deltaMin += 10080
  const countdownMs = deltaMin * 60_000 - now.getSeconds() * 1000 - now.getMilliseconds()

  return (
    <div className="mt-3 text-xs text-text-muted">
      <span className="text-text-secondary">{formatCountdown(countdownMs)}</span>{' '}
      {next.rule ? (
        <>
          avant <span style={{ color: next.rule.color }}>{next.rule.name}</span>
        </>
      ) : (
        <>avant la fin</>
      )}
    </div>
  )
}

function CurrentChip({ rule }: { rule: TimeRule }) {
  const Icon = iconByName(rule.icon)
  return (
    <div
      className="mt-3 inline-flex items-center gap-2 rounded-2xl px-3 py-1 text-xs font-medium uppercase tracking-wider text-white shadow-elevated"
      style={{ backgroundColor: rule.color }}
    >
      {Icon && <Icon size={12} strokeWidth={2.5} />}
      {rule.name}
    </div>
  )
}
