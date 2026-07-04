import * as React from 'react'
import {
  add,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  getDay,
  isEqual,
  isSameDay,
  isSameMonth,
  isToday,
  startOfToday,
  startOfWeek,
} from 'date-fns'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { durationLabel, minuteToClockLabel } from '@/lib/format-time'
import type { DailyLoad, PlacedBlock } from '@/lib/placement-engine'

type MonthEvent = {
  id: string
  name: string
  time: string
  datetime: string
  kind: PlacedBlock['kind']
}

type MonthDay = {
  day: Date
  freeMinutes?: number
  events: MonthEvent[]
}

type FullScreenMonthCalendarProps = {
  currentMonth: Date
  onCurrentMonthChange: React.Dispatch<React.SetStateAction<Date>>
  placement: {
    blocks: PlacedBlock[]
    dailyLoad: DailyLoad[]
  }
  planningStartDate: Date
  planningEndDate: Date
  minMonth: Date
  maxMonth: Date
  isPlanningClamped: boolean
  horizonDays: number
}

const colStartClasses = [
  '',
  'col-start-2',
  'col-start-3',
  'col-start-4',
  'col-start-5',
  'col-start-6',
  'col-start-7',
]

const DAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const MONTH_NAMES = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
]

function mondayColumnStart(day: Date): string {
  return colStartClasses[(getDay(day) + 6) % 7] ?? ''
}

function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number) as [number, number, number]
  return new Date(year, month - 1, day)
}

function eventTone(kind: PlacedBlock['kind']): string {
  if (kind === 'break') return 'border-l-[#7E7E82] bg-white/[0.035]'
  if (kind === 'objective') return 'border-l-[#C4C4C4] bg-white/[0.055]'
  return 'border-l-[#D8D8D8] bg-white/[0.065]'
}

function buildMonthData(blocks: PlacedBlock[], freeByDate: Map<string, number>): MonthDay[] {
  const byDate = new Map<string, MonthDay>()

  for (const [date, freeMinutes] of freeByDate.entries()) {
    byDate.set(date, {
      day: parseLocalDate(date),
      freeMinutes,
      events: [],
    })
  }

  for (const block of blocks) {
    if (block.kind !== 'task' && block.kind !== 'objective' && block.kind !== 'break') continue
    const day = byDate.get(block.date) ?? {
      day: parseLocalDate(block.date),
      events: [],
    }
    day.events.push({
      id: block.id,
      name: block.label,
      time: `${minuteToClockLabel(block.startMinute)} - ${minuteToClockLabel(block.endMinute)}`,
      datetime: `${block.date}T00:00`,
      kind: block.kind,
    })
    byDate.set(block.date, day)
  }

  return [...byDate.values()].map((day) => ({
    ...day,
    events: day.events.sort((a, b) => a.time.localeCompare(b.time)),
  }))
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}`
}

function startOfLocalMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function isBeforeMonth(a: Date, b: Date): boolean {
  return startOfLocalMonth(a).getTime() < startOfLocalMonth(b).getTime()
}

function isAfterMonth(a: Date, b: Date): boolean {
  return startOfLocalMonth(a).getTime() > startOfLocalMonth(b).getTime()
}

function isInDisplayedMonth(dateStr: string, month: Date): boolean {
  return monthKey(parseLocalDate(dateStr)) === monthKey(month)
}

function isBeforeLocalDay(a: Date, b: Date): boolean {
  return (
    new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime() <
    new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime()
  )
}

function isAfterLocalDay(a: Date, b: Date): boolean {
  return (
    new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime() >
    new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime()
  )
}

export function FullScreenMonthCalendar({
  currentMonth,
  onCurrentMonthChange,
  placement,
  planningStartDate,
  planningEndDate,
  minMonth,
  maxMonth,
  isPlanningClamped,
  horizonDays,
}: FullScreenMonthCalendarProps): JSX.Element {
  const today = startOfToday()
  const [selectedDay, setSelectedDay] = React.useState(today)
  const firstDayCurrentMonth = React.useMemo(
    () => new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1),
    [currentMonth],
  )
  const lastDayCurrentMonth = endOfMonth(firstDayCurrentMonth)
  const { blocks, dailyLoad } = placement
  const canGoPrevious = !isBeforeMonth(add(firstDayCurrentMonth, { months: -1 }), minMonth)
  const canGoNext = !isAfterMonth(add(firstDayCurrentMonth, { months: 1 }), maxMonth)

  const days = eachDayOfInterval({
    start: startOfWeek(firstDayCurrentMonth, { weekStartsOn: 1 }),
    end: endOfWeek(lastDayCurrentMonth, { weekStartsOn: 1 }),
  })

  const data = React.useMemo(() => {
    const freeByDate = new Map<string, number>()
    for (const load of dailyLoad) freeByDate.set(load.date, load.freeMinutes)
    return buildMonthData(blocks, freeByDate)
  }, [blocks, dailyLoad])

  const dataForDay = React.useCallback(
    (day: Date) => data.find((candidate) => isSameDay(candidate.day, day)),
    [data],
  )

  const selectedDayData = dataForDay(selectedDay)

  const monthSummary = React.useMemo(() => {
    const workedMinutes = blocks
      .filter(
        (block) =>
          isInDisplayedMonth(block.date, firstDayCurrentMonth) &&
          (block.kind === 'task' || block.kind === 'objective'),
      )
      .reduce((sum, block) => sum + (block.endMinute - block.startMinute), 0)
    const recoveryMinutes = blocks
      .filter(
        (block) =>
          isInDisplayedMonth(block.date, firstDayCurrentMonth) && block.kind === 'break',
      )
      .reduce((sum, block) => sum + (block.endMinute - block.startMinute), 0)
    const freeMinutes = dailyLoad
      .filter((load) => isInDisplayedMonth(load.date, firstDayCurrentMonth))
      .reduce((sum, load) => sum + load.freeMinutes, 0)
    const calculatedDays = dailyLoad.filter((load) =>
      isInDisplayedMonth(load.date, firstDayCurrentMonth),
    ).length
    return { workedMinutes, recoveryMinutes, freeMinutes, calculatedDays }
  }, [blocks, dailyLoad, firstDayCurrentMonth])

  function previousMonth(): void {
    if (!canGoPrevious) return
    onCurrentMonthChange((month) => add(month, { months: -1 }))
  }

  function nextMonth(): void {
    if (!canGoNext) return
    onCurrentMonthChange((month) => add(month, { months: 1 }))
  }

  function goToToday(): void {
    onCurrentMonthChange(new Date(today.getFullYear(), today.getMonth(), 1))
    setSelectedDay(today)
  }

  return (
    <div className="info-panel flex min-h-[720px] flex-1 flex-col rounded-xl">
      <div className="flex flex-col gap-4 border-b border-border-subtle p-4 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <div className="hidden w-20 flex-col items-center justify-center rounded-lg border border-border-subtle bg-bg-base/70 p-0.5 md:flex">
            <div className="p-1 text-xs uppercase text-text-muted">
              {MONTH_NAMES[today.getMonth()]?.slice(0, 3)}
            </div>
            <div className="flex w-full items-center justify-center rounded-lg border border-border-subtle bg-bg-card px-2 py-1 text-lg font-bold text-text-primary">
              {format(today, 'd')}
            </div>
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <CalendarDays size={18} className="text-accent" />
              <h3 className="truncate text-lg font-semibold text-text-primary">
                {MONTH_NAMES[firstDayCurrentMonth.getMonth()]} {firstDayCurrentMonth.getFullYear()}
              </h3>
            </div>
            <p className="mt-1 text-sm text-text-muted">
              {format(firstDayCurrentMonth, 'd MMM yyyy')} - {format(lastDayCurrentMonth, 'd MMM yyyy')}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="inline-flex w-full overflow-hidden rounded-lg border border-border-subtle bg-bg-base/70 md:w-auto">
            <Button
              type="button"
              onClick={previousMonth}
              disabled={!canGoPrevious}
              variant="ghost"
              size="sm"
              className={cn(
                'h-9 rounded-none border-0 px-3',
                !canGoPrevious && 'cursor-not-allowed opacity-40',
              )}
              aria-label="Mois précédent"
            >
              <ChevronLeft size={16} />
            </Button>
            <Button
              type="button"
              onClick={goToToday}
              variant="ghost"
              size="sm"
              className="h-9 rounded-none border-0 px-4"
            >
              Aujourd&apos;hui
            </Button>
            <Button
              type="button"
              onClick={nextMonth}
              disabled={!canGoNext}
              variant="ghost"
              size="sm"
              className={cn(
                'h-9 rounded-none border-0 px-3',
                !canGoNext && 'cursor-not-allowed opacity-40',
              )}
              aria-label="Mois suivant"
            >
              <ChevronRight size={16} />
            </Button>
          </div>

          <div className="rounded-lg border border-border-subtle bg-white/[0.03] px-3 py-2 text-xs text-text-muted">
            Prévision {horizonDays} jours
          </div>
        </div>
      </div>

      {isPlanningClamped && (
        <div className="border-b border-border-subtle bg-orange/10 px-4 py-2 text-xs text-orange">
          La fin de ce mois dépasse la fenêtre de prévision. Les jours après le{' '}
          {planningEndDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} ne
          sont pas calculés.
        </div>
      )}

      <div className="grid gap-px border-b border-border-subtle bg-border-subtle text-xs sm:grid-cols-4">
        <MonthSummaryCell label="Jours calculés" value={`${monthSummary.calculatedDays}`} />
        <MonthSummaryCell label="Temps placé" value={durationLabel(monthSummary.workedMinutes)} />
        <MonthSummaryCell label="Non planifié" value={durationLabel(monthSummary.freeMinutes)} />
        <MonthSummaryCell label="Récupération" value={durationLabel(monthSummary.recoveryMinutes)} />
      </div>

      <div className="grid grid-cols-7 border-b border-border-subtle text-center text-xs font-semibold leading-6 text-text-muted">
        {DAYS_FR.map((day, index) => (
          <div key={day} className={cn('py-2.5', index < DAYS_FR.length - 1 && 'border-r border-border-subtle')}>
            {day}
          </div>
        ))}
      </div>

      <div className="flex flex-1 text-xs leading-6">
        <div className="hidden w-full grid-cols-7 auto-rows-fr lg:grid">
          {days.map((day, dayIdx) => {
            const dayData = dataForDay(day)
            const events = dayData?.events ?? []
            const selected = isEqual(day, selectedDay)
            const inMonth = isSameMonth(day, firstDayCurrentMonth)
            const outOfPlanningWindow =
              isBeforeLocalDay(day, planningStartDate) || isAfterLocalDay(day, planningEndDate)
            return (
              <button
                key={day.toISOString()}
                type="button"
                onClick={() => setSelectedDay(day)}
                className={cn(
                  dayIdx === 0 && mondayColumnStart(day),
                  'relative flex min-h-[132px] flex-col border-b border-r border-border-subtle p-2.5 text-left outline-none transition-colors hover:bg-white/[0.04] focus:z-10',
                  !inMonth && 'bg-white/[0.025] text-text-muted',
                  outOfPlanningWindow && 'bg-white/[0.018] opacity-60',
                  selected && 'bg-white/[0.065]',
                )}
              >
                <header className="flex items-start justify-between gap-2">
                  <span
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded-full text-xs',
                      selected && 'bg-accent text-black',
                      !selected && isToday(day) && 'border border-accent text-accent',
                      !selected && !isToday(day) && inMonth && 'text-text-primary',
                      !inMonth && 'text-text-muted',
                    )}
                  >
                    <time dateTime={format(day, 'yyyy-MM-dd')}>{format(day, 'd')}</time>
                  </span>
                  {dayData?.freeMinutes !== undefined && (
                    <span className="rounded-md border border-border-subtle bg-bg-base/70 px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
                      {durationLabel(dayData.freeMinutes)}
                    </span>
                  )}
                  {dayData?.freeMinutes === undefined && outOfPlanningWindow && inMonth && (
                    <span className="rounded-md border border-border-subtle bg-bg-base/70 px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
                      hors prévision
                    </span>
                  )}
                </header>

                <div className="mt-2 space-y-1.5">
                  {events.slice(0, 2).map((event) => (
                    <div
                      key={event.id}
                      className={cn(
                        'min-w-0 rounded-lg border border-border-subtle border-l-2 p-2 text-xs leading-tight text-text-primary shadow-card',
                        eventTone(event.kind),
                      )}
                    >
                      <div className="truncate font-medium leading-none">{event.name}</div>
                      <div className="mt-1 truncate leading-none text-text-muted">{event.time}</div>
                    </div>
                  ))}
                  {events.length > 2 && (
                    <div className="text-xs text-text-muted">+ {events.length - 2} autres</div>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        <div className="grid w-full grid-cols-7 auto-rows-fr lg:hidden">
          {days.map((day) => {
            const dayData = dataForDay(day)
            const selected = isEqual(day, selectedDay)
            const inMonth = isSameMonth(day, firstDayCurrentMonth)
            const outOfPlanningWindow =
              isBeforeLocalDay(day, planningStartDate) || isAfterLocalDay(day, planningEndDate)
            return (
              <button
                type="button"
                key={day.toISOString()}
                onClick={() => setSelectedDay(day)}
                className={cn(
                  'flex min-h-16 flex-col border-b border-r border-border-subtle px-2 py-2 outline-none hover:bg-white/[0.04] focus:z-10',
                  !inMonth && 'bg-white/[0.025] text-text-muted',
                  outOfPlanningWindow && 'bg-white/[0.018] opacity-60',
                  selected && 'bg-white/[0.065]',
                )}
              >
                <time
                  dateTime={format(day, 'yyyy-MM-dd')}
                  className={cn(
                    'ml-auto flex h-6 w-6 items-center justify-center rounded-full text-xs',
                    selected && 'bg-accent text-black',
                    !selected && isToday(day) && 'border border-accent text-accent',
                    !selected && inMonth && 'text-text-primary',
                    !inMonth && 'text-text-muted',
                  )}
                >
                  {format(day, 'd')}
                </time>
                {(dayData?.events.length ?? 0) > 0 && (
                  <div className="mt-auto flex flex-wrap-reverse gap-1">
                    {dayData!.events.slice(0, 4).map((event) => (
                      <span key={event.id} className="h-1.5 w-1.5 rounded-full bg-accent/80" />
                    ))}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="border-t border-border-subtle p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-sm font-semibold text-text-primary">
              {selectedDay.toLocaleDateString('fr-FR', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </div>
            <div className="mt-1 text-xs text-text-muted">
              {isBeforeLocalDay(selectedDay, planningStartDate)
                ? "L'historique passé n'est pas reconstruit dans cette vue de prévision."
                : isAfterLocalDay(selectedDay, planningEndDate)
                  ? "Cette journée dépasse la fenêtre de prévision actuelle."
                  : selectedDayData?.freeMinutes !== undefined
                    ? `${durationLabel(selectedDayData.freeMinutes)} non planifié`
                    : 'Aucune donnée générée pour cette journée.'}
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-1.5 md:max-w-xl">
            {(selectedDayData?.events.length ?? 0) === 0 ? (
              <div className="rounded-lg border border-dashed border-border-subtle px-3 py-2 text-xs text-text-muted">
                {isBeforeLocalDay(selectedDay, planningStartDate)
                  ? 'Les sessions passées ne sont pas affichées ici.'
                  : isAfterLocalDay(selectedDay, planningEndDate)
                    ? 'Avance moins loin dans la prévision pour générer ce jour.'
                    : 'Aucun bloc généré pour ce jour.'}
              </div>
            ) : (
              selectedDayData!.events.map((event) => (
                <div
                  key={event.id}
                  className={cn(
                    'flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border-subtle border-l-2 bg-white/[0.035] px-3 py-2 text-xs',
                    eventTone(event.kind),
                  )}
                >
                  <span className="truncate font-medium text-text-primary">{event.name}</span>
                  <span className="shrink-0 font-mono text-text-muted">{event.time}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function MonthSummaryCell({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="bg-bg-card px-4 py-3">
      <div className="text-[10px] font-medium uppercase tracking-widest text-text-muted">
        {label}
      </div>
      <div className="mt-1 font-mono text-sm font-semibold text-text-primary">{value}</div>
    </div>
  )
}
