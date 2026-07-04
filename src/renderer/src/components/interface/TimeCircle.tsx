import { useEffect, useId, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Moon, Target } from 'lucide-react'
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
import type { PlacedBlock } from '@/lib/placement-engine'

type Props = {
  rules: TimeRule[]
  entries: ScheduleEntry[]
  blocks?: PlacedBlock[]
  size?: number
}

type CirclePlannedBlock = PlacedBlock & {
  color: string
  opacity: number
  route: string | null
}

// Géométrie SVG
const STROKE = 28
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
  if (rule.categoryType === 'sleep') return { color: '#111113', opacity: 1 }
  if (rule.categoryType === 'school') return { color: '#E2E2E2', opacity: 0.72 }
  if (rule.categoryType === 'work') return { color: '#A8A8AC', opacity: 1 }
  if (rule.categoryType === 'commitment') return { color: '#525252', opacity: 0.9 }
  if (rule.categoryType === 'free') return { color: 'transparent', opacity: 1 }
  return { color: '#737373', opacity: 0.9 }
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
  return Math.round((to.getTime() - from.getTime()) / 86_400_000)
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

export function TimeCircle({ rules, entries, blocks = [], size = 480 }: Props) {
  const navigate = useNavigate()
  const glowId = useId()
  const subtleGlowId = useId()
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

  const plannedBlocks = useMemo<CirclePlannedBlock[]>(
    () =>
      blocks
        .filter(
          (block) =>
            block.date === todayStr &&
            (block.kind === 'task' || block.kind === 'objective' || block.kind === 'break'),
        )
        .map((block) => {
          const color =
            block.kind === 'break' ? '#525252' : block.kind === 'objective' ? '#737373' : '#8A8A8A'
          const route =
            block.kind === 'objective' && block.refId
              ? `/objectives?objective=${block.refId}`
              : block.kind === 'task'
                ? '/tasks'
                : null
          return {
            ...block,
            color,
            opacity: block.kind === 'break' ? 0.8 : 1,
            route,
          }
        })
        .sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute),
    [blocks, todayStr],
  )

  const currentPlannedBlock = plannedBlocks.find(
    (block) => minuteOfDay >= block.startMinute && minuteOfDay < block.endMinute,
  )

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
                stroke={currentEntryId === e.id ? '#FFFFFF' : display.color}
                strokeWidth={currentEntryId === e.id ? STROKE + 1 : STROKE}
                strokeLinecap="round"
                opacity={display.opacity}
                filter={currentEntryId === e.id ? `url(#${glowId})` : undefined}
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
              stroke={currentEntryId === e.id ? '#FFFFFF' : display.color}
              strokeWidth={currentEntryId === e.id ? STROKE + 1 : STROKE}
              strokeLinecap="round"
              opacity={currentEntryId === e.id ? 1 : Math.min(display.opacity, 0.7)}
              filter={currentEntryId === e.id ? `url(#${glowId})` : undefined}
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
      glowId,
      navigate,
      objectiveByRuleId,
      ruleById,
      todayEntries,
      trackRadius,
      urgencyByObjectiveId,
    ],
  )

  const plannedSegments = useMemo(
    () =>
      plannedBlocks.map((block) => {
        const clickable = Boolean(block.route)
        const startMinute = Math.max(0, block.startMinute - ARC_JOIN_OVERLAP_MINUTES)
        const endMinute = Math.min(1440, block.endMinute + ARC_JOIN_OVERLAP_MINUTES)
        const startA = minuteToAngle(startMinute)
        const endA = minuteToAngle(endMinute)
        const isCurrent = currentPlannedBlock?.id === block.id
        const strokeWidth = block.kind === 'break' ? STROKE - 18 : isCurrent ? STROKE + 1 : STROKE - 4
        const commonProps = {
          fill: 'none',
          stroke: isCurrent ? '#FFFFFF' : block.color,
          strokeWidth,
          strokeLinecap: 'round' as const,
          opacity: isCurrent ? 1 : block.opacity,
          filter: isCurrent ? `url(#${glowId})` : undefined,
          className: clickable ? 'transition-opacity hover:opacity-100' : undefined,
          pointerEvents: clickable ? ('stroke' as const) : undefined,
          style: { transition: 'opacity 250ms' },
        }

        const onActivate = clickable && block.route ? () => navigate(block.route!) : undefined
        const onKeyDown =
          clickable && block.route
            ? (event: React.KeyboardEvent<SVGGElement>) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  navigate(block.route!)
                }
              }
            : undefined

        return (
          <g
            key={block.id}
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
            onClick={onActivate}
            onKeyDown={onKeyDown}
            className={clickable ? 'cursor-pointer' : undefined}
          >
            <path d={describeArc(cx, cy, trackRadius, startA, endA)} {...commonProps} />
          </g>
        )
      }),
    [currentPlannedBlock?.id, cx, cy, glowId, navigate, plannedBlocks, trackRadius],
  )

  return (
    <div className="relative flex flex-col items-center">
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <div className="absolute left-1/2 top-0 -translate-x-1/2 text-[10px] font-semibold tracking-widest text-text-muted">
          00:00
        </div>
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[10px] font-semibold tracking-widest text-text-muted">
          12:00
        </div>
        <div className="absolute right-0 top-1/2 -translate-y-1/2 text-[10px] font-semibold tracking-widest text-text-muted">
          06:00
        </div>
        <div className="absolute left-0 top-1/2 -translate-y-1/2 text-[10px] font-semibold tracking-widest text-text-muted">
          18:00
        </div>

        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="absolute inset-0 block drop-shadow-xl"
        >
          <defs>
            <radialGradient id="tc-bg" cx="50%" cy="50%" r="50%">
              <stop offset="54%" stopColor="#020202" stopOpacity="0" />
              <stop offset="100%" stopColor="#111113" stopOpacity="0.66" />
            </radialGradient>
            <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            <filter id={subtleGlowId} x="-12%" y="-12%" width="124%" height="124%">
              <feGaussianBlur stdDeviation="1.5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          <circle cx={cx} cy={cy} r={innerRadius + STROKE} fill="url(#tc-bg)" />
          <circle
            cx={cx}
            cy={cy}
            r={trackRadius}
            fill="none"
            stroke="#121212"
            strokeWidth={STROKE}
            strokeLinecap="round"
          />

          {Array.from({ length: 24 }, (_, h) => {
            const angle = minuteToAngle(h * 60)
            const inner = polarToCartesian(cx, cy, tickRadius - 14, angle)
            const outer = polarToCartesian(cx, cy, tickRadius - 6, angle)
            const major = h % 6 === 0
            return (
              <line
                key={h}
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                stroke={major ? '#525252' : '#262626'}
                strokeWidth={major ? 2 : 1}
                strokeLinecap="round"
              />
            )
          })}

          {segments}
          {plannedSegments}

          <TimeCircleNeedle cx={cx} cy={cy} trackRadius={trackRadius} glowId={glowId} />
        </svg>

        <div
          className="pointer-events-none absolute rounded-full border border-white/5 bg-bg-base/70 shadow-[inset_0_0_70px_rgba(255,255,255,0.025)] backdrop-blur-xl"
          style={{
            inset: size * 0.22,
          }}
        />

        <div className="pointer-events-none absolute inset-[22%] z-10 flex flex-col items-center justify-center text-center">
          <CurrentGlyph currentRule={current?.rule ?? null} hasPlannedBlock={Boolean(currentPlannedBlock)} />
          {currentPlannedBlock ? (
            <CurrentPlannedBlockChip block={currentPlannedBlock} />
          ) : current ? (
            <CurrentChip rule={current.rule} />
          ) : (
            <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted">
              Temps libre
            </div>
          )}
          <div className="mt-1 font-mono text-6xl font-medium tabular-nums tracking-tighter text-text-primary">
            {minuteToClockLabel(Math.floor(minuteOfDay))}
          </div>
          <div className="mb-3 mt-2 h-px w-12 bg-gradient-to-r from-transparent via-border-strong to-transparent" />
          <CountdownText state={state} blocks={plannedBlocks} />
        </div>
      </div>

      <div className="mt-3 flex justify-center gap-6">
        <LegendItem color="#FFFFFF" glow label="Focus" />
        <LegendItem color="#737373" label="Planifié" />
        <LegendItem color="#525252" thin label="Pause" />
      </div>
    </div>
  )
}

function TimeCircleNeedle({
  cx,
  cy,
  trackRadius,
  glowId,
}: {
  cx: number
  cy: number
  trackRadius: number
  glowId: string
}): JSX.Element {
  const now = useSecondNow()
  const minuteOfDay = dateToMinuteOfDay(now) + now.getSeconds() / 60 + now.getMilliseconds() / 60000
  const angle = minuteToAngle(minuteOfDay)
  const inner = polarToCartesian(cx, cy, 0, angle)
  const mutedOuter = polarToCartesian(cx, cy, trackRadius - 10, angle)
  const outer = polarToCartesian(cx, cy, trackRadius + STROKE / 2 + 3, angle)
  const marker = polarToCartesian(cx, cy, trackRadius + STROKE / 2 + 15, angle)

  return (
    <g pointerEvents="none">
      <line
        x1={inner.x}
        y1={inner.y}
        x2={mutedOuter.x}
        y2={mutedOuter.y}
        stroke="#FFFFFF"
        strokeWidth={1}
        opacity={0.13}
        strokeLinecap="round"
      />
      <line
        x1={mutedOuter.x}
        y1={mutedOuter.y}
        x2={outer.x}
        y2={outer.y}
        stroke="#FFFFFF"
        strokeWidth={1.5}
        opacity={0.85}
        strokeLinecap="round"
      />
      <circle cx={outer.x} cy={outer.y} r={5} fill="#FFFFFF" filter={`url(#${glowId})`} />
      <circle cx={marker.x} cy={marker.y} r={2} fill="#FFFFFF" opacity={0.9} />
    </g>
  )
}

function CurrentGlyph({
  currentRule,
  hasPlannedBlock,
}: {
  currentRule: TimeRule | null
  hasPlannedBlock: boolean
}): JSX.Element {
  const Icon = hasPlannedBlock
    ? Target
    : currentRule?.categoryType === 'sleep'
      ? Moon
      : iconByName(currentRule?.icon) ?? Target

  return (
    <div className="mb-1 flex h-8 items-center justify-center text-text-primary">
      <Icon size={24} strokeWidth={1.6} />
    </div>
  )
}

function LegendItem({
  color,
  label,
  glow = false,
  thin = false,
}: {
  color: string
  label: string
  glow?: boolean
  thin?: boolean
}): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <span
        className={thin ? 'h-0.5 w-3 rounded-full' : 'h-2 w-2 rounded-full'}
        style={{
          backgroundColor: color,
          boxShadow: glow ? '0 0 8px rgba(255,255,255,0.85)' : undefined,
        }}
      />
      <span className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
        {label}
      </span>
    </div>
  )
}

function CountdownText({
  state,
  blocks,
}: {
  state: ScheduleState
  blocks: CirclePlannedBlock[]
}): JSX.Element | null {
  const now = useSecondNow()
  const next = getNextChange(state, now)
  const todayStr = localDateKey(now)
  const minuteOfDay = dateToMinuteOfDay(now)

  const blockCandidate = blocks
    .filter((block) => block.date === todayStr)
    .flatMap((block) => {
      if (minuteOfDay >= block.startMinute && minuteOfDay < block.endMinute) {
        return [
          {
            atMinute: block.endMinute,
            label: block.label,
            color: block.color,
            prefix: 'avant la fin de',
          },
        ]
      }
      if (minuteOfDay < block.startMinute) {
        return [
          {
            atMinute: block.startMinute,
            label: block.label,
            color: block.color,
            prefix: 'avant',
          },
        ]
      }
      return []
    })
    .sort((a, b) => a.atMinute - b.atMinute)[0]

  const blockCountdownMs = blockCandidate
    ? (blockCandidate.atMinute - minuteOfDay) * 60_000 -
      now.getSeconds() * 1000 -
      now.getMilliseconds()
    : Number.POSITIVE_INFINITY

  if (!next && !blockCandidate) return null

  let scheduleCountdownMs = Number.POSITIVE_INFINITY
  if (next) {
    const nowMow = dateToMinuteOfWeek(now)
    let deltaMin = next.atMinuteOfWeek - nowMow
    if (deltaMin < 0) deltaMin += 10080
    scheduleCountdownMs = deltaMin * 60_000 - now.getSeconds() * 1000 - now.getMilliseconds()
  }

  if (blockCandidate && blockCountdownMs <= scheduleCountdownMs) {
    return (
      <div className="flex items-center gap-1.5 rounded-full border border-border-subtle bg-bg-elevated/80 px-3 py-1 shadow-inner">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
        <span className="font-mono text-xs font-medium tabular-nums text-text-secondary">
          {formatCountdown(blockCountdownMs)}
        </span>
        <span className="text-xs font-normal text-text-muted">restant</span>
      </div>
    )
  }

  if (!next) return null

  return (
    <div className="flex items-center gap-1.5 rounded-full border border-border-subtle bg-bg-elevated/80 px-3 py-1 shadow-inner">
      <span className="h-1.5 w-1.5 rounded-full bg-text-muted" />
      <span className="font-mono text-xs font-medium tabular-nums text-text-secondary">
        {formatCountdown(scheduleCountdownMs)}
      </span>
      <span className="text-xs font-normal text-text-muted">
        {next.rule ? 'avant changement' : 'avant la fin'}
      </span>
    </div>
  )
}

function CurrentPlannedBlockChip({ block }: { block: CirclePlannedBlock }) {
  return (
    <div className="mt-1 inline-flex max-w-[78%] items-center gap-2 truncate text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted">
      <span className="truncate">{block.label}</span>
    </div>
  )
}

function CurrentChip({ rule }: { rule: TimeRule }) {
  return (
    <div className="mt-1 inline-flex max-w-[78%] items-center gap-2 truncate text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted">
      {rule.name}
    </div>
  )
}
