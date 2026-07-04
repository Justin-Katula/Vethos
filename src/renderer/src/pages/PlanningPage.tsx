import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Calendar, CheckCircle2, ChevronRight, Grid3X3, Info } from 'lucide-react'
import { PageTransition } from '@/components/PageTransition'
import { RuleTable } from '@/components/interface/RuleTable'
import { WeekCalendar } from '@/components/interface/WeekCalendar'
import { FullScreenMonthCalendar } from '@/components/interface/FullScreenMonthCalendar'
import { RuleEditor } from '@/components/interface/RuleEditor'
import { PageSkeleton, Skeleton, SkeletonRow } from '@/components/ui/Skeleton'
import { useScheduleStore } from '@/store/schedule.store'
import { useBlockingStore } from '@/store/blocking.store'
import { useToast } from '@/lib/use-toast'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import type { TimeRule } from '@shared/schemas'
import { usePlacement, localDateKey } from '@/lib/use-placement'
import { viewportFromSettings } from '@/lib/calendar-viewport'
import { useSettingsStore } from '@/store/settings.store'
import { useLevelsStore } from '@/store/levels.store'
import { useTasksStore } from '@/store/tasks.store'
import { durationLabel } from '@/lib/format-time'
import {
  itemDisplayedMinutes,
  missingMinutesForDiagnostics,
  type PlanningStatusTone,
  statusView,
} from '@/lib/planning-ui'
import type { PlacementDiagnostics } from '@/lib/placement-engine'

const MONTH_PLANNING_HORIZON_DAYS = 60

function startOfLocalMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function endOfLocalMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0)
}

function addLocalDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

function minLocalDate(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b
}

function isBeforeMonth(a: Date, b: Date): boolean {
  return startOfLocalMonth(a).getTime() < startOfLocalMonth(b).getTime()
}

function isAfterMonth(a: Date, b: Date): boolean {
  return startOfLocalMonth(a).getTime() > startOfLocalMonth(b).getTime()
}

function inclusiveLocalDayCount(start: Date, end: Date): number {
  const startDay = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())
  const endDay = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate())
  return Math.max(1, Math.floor((endDay - startDay) / 86_400_000) + 1)
}

function dateKeyIsInMonth(dateStr: string, month: Date): boolean {
  const [year, monthNumber] = dateStr.split('-').map(Number) as [number, number]
  return year === month.getFullYear() && monthNumber === month.getMonth() + 1
}

export default function PlanningPage() {
  const { loaded, rules, entries, load, saveRule, deleteRule, saveEntry, deleteEntry } =
    useScheduleStore()
  const blockingState = useBlockingStore((s) => s.state)
  const loadBlocking = useBlockingStore((s) => s.load)
  const blockingLoaded = useBlockingStore((s) => s.loaded)
  const toast = useToast()

  const [editorOpen, setEditorOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<TimeRule | null>(null)
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week')
  const [showPlanDetails, setShowPlanDetails] = useState(false)
  const [monthCursor, setMonthCursor] = useState(() => startOfLocalMonth(new Date()))

  const sleepStart = useSettingsStore((s) => s.sleepStart)
  const sleepEnd = useSettingsStore((s) => s.sleepEnd)
  const tasks = useTasksStore((s) => s.tasks)
  const tasksUserId = useTasksStore((s) => s.userId)
  const objectives = useLevelsStore((s) => s.objectives)
  const loadTasks = useTasksStore((s) => s.load)
  const loadLevels = useLevelsStore((s) => s.load)
  const tasksLoaded = useTasksStore((s) => s.loaded)
  const levelsLoaded = useLevelsStore((s) => s.loaded)
  const scheduleLoadUserRef = useRef<string | null>(null)
  const blockingLoadUserRef = useRef<string | null>(null)
  const tasksLoadUserRef = useRef<string | null>(null)
  const levelsLoadUserRef = useRef<string | null>(null)

  useEffect(() => {
    if (!tasksUserId) return
    if (!loaded && scheduleLoadUserRef.current !== tasksUserId) {
      scheduleLoadUserRef.current = tasksUserId
      void load(tasksUserId).finally(() => {
        if (scheduleLoadUserRef.current === tasksUserId) scheduleLoadUserRef.current = null
      })
    }
    if (!blockingLoaded && blockingLoadUserRef.current !== tasksUserId) {
      blockingLoadUserRef.current = tasksUserId
      void loadBlocking(tasksUserId).finally(() => {
        if (blockingLoadUserRef.current === tasksUserId) blockingLoadUserRef.current = null
      })
    }
    if (!tasksLoaded && tasksLoadUserRef.current !== tasksUserId) {
      tasksLoadUserRef.current = tasksUserId
      void loadTasks(tasksUserId).finally(() => {
        if (tasksLoadUserRef.current === tasksUserId) tasksLoadUserRef.current = null
      })
    }
    if (!levelsLoaded && levelsLoadUserRef.current !== tasksUserId) {
      levelsLoadUserRef.current = tasksUserId
      void loadLevels(tasksUserId).finally(() => {
        if (levelsLoadUserRef.current === tasksUserId) levelsLoadUserRef.current = null
      })
    }
  }, [
    load,
    loadBlocking,
    loadTasks,
    loadLevels,
    loaded,
    blockingLoaded,
    tasksLoaded,
    tasksUserId,
    levelsLoaded,
  ])

  const [todayStr, setTodayStr] = useState(() => localDateKey(new Date()))
  useEffect(() => {
    const id = setInterval(() => {
      const current = localDateKey(new Date())
      if (current !== todayStr) setTodayStr(current)
    }, 60_000)
    return () => clearInterval(id)
  }, [todayStr])

  const planningToday = useMemo(() => {
    const [y, m, d] = todayStr.split('-').map(Number) as [number, number, number]
    return new Date(y, m - 1, d)
  }, [todayStr])
  const weekDates = useMemo(() => {
    const dow = (planningToday.getDay() + 6) % 7
    const monday = new Date(
      planningToday.getFullYear(),
      planningToday.getMonth(),
      planningToday.getDate() - dow,
    )
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)
      return localDateKey(d)
    })
  }, [planningToday])

  const viewport = useMemo(() => viewportFromSettings(sleepStart, sleepEnd), [sleepStart, sleepEnd])

  // Plan opérationnel semaine : aujourd'hui → aujourd'hui + 6.
  const weekRangeEnd = useMemo(() => {
    const d = addLocalDays(planningToday, 6)
    return localDateKey(d)
  }, [planningToday])
  const monthBounds = useMemo(() => {
    const minMonth = startOfLocalMonth(planningToday)
    const maxPlanningDate = addLocalDays(planningToday, MONTH_PLANNING_HORIZON_DAYS - 1)
    const maxMonth = startOfLocalMonth(maxPlanningDate)
    return { minMonth, maxMonth, maxPlanningDate }
  }, [planningToday])

  useEffect(() => {
    setMonthCursor((current) => {
      if (isBeforeMonth(current, monthBounds.minMonth)) return monthBounds.minMonth
      if (isAfterMonth(current, monthBounds.maxMonth)) return monthBounds.maxMonth
      return current
    })
  }, [monthBounds.minMonth, monthBounds.maxMonth])

  const monthRange = useMemo(() => {
    const monthStart = startOfLocalMonth(monthCursor)
    const monthEnd = endOfLocalMonth(monthCursor)
    const isInPlanningWindow =
      !isBeforeMonth(monthStart, monthBounds.minMonth) &&
      monthStart.getTime() <= monthBounds.maxPlanningDate.getTime()
    const end = isInPlanningWindow
      ? minLocalDate(monthEnd, monthBounds.maxPlanningDate)
      : planningToday
    return {
      endStr: localDateKey(end),
      maxPlanningDays: viewMode === 'month' && isInPlanningWindow
        ? inclusiveLocalDayCount(planningToday, end)
        : 1,
      isClamped: isInPlanningWindow && monthEnd.getTime() > monthBounds.maxPlanningDate.getTime(),
    }
  }, [monthBounds, monthCursor, planningToday, viewMode])

  const weekPlacement = usePlacement(planningToday, weekRangeEnd, { todayStartMinute: 0 })
  const monthPlacement = usePlacement(planningToday, monthRange.endStr, {
    maxPlanningDays: monthRange.maxPlanningDays,
    todayStartMinute: 0,
  })
  const activePlacement = viewMode === 'month' ? monthPlacement : weekPlacement
  const diagnostics = activePlacement.diagnostics
  const monthMetrics = useMemo(() => {
    const plannedMinutes = monthPlacement.blocks
      .filter(
        (block) =>
          dateKeyIsInMonth(block.date, monthCursor) &&
          (block.kind === 'task' || block.kind === 'objective'),
      )
      .reduce((sum, block) => sum + (block.endMinute - block.startMinute), 0)
    const unplannedMinutes = monthPlacement.dailyLoad
      .filter((load) => dateKeyIsInMonth(load.date, monthCursor))
      .reduce((sum, load) => sum + load.freeMinutes, 0)
    return { plannedMinutes, unplannedMinutes }
  }, [monthPlacement.blocks, monthPlacement.dailyLoad, monthCursor])
  const displayedPlannedMinutes =
    viewMode === 'month' ? monthMetrics.plannedMinutes : diagnostics.plannedMinutes
  const displayedUnplannedMinutes =
    viewMode === 'month' ? monthMetrics.unplannedMinutes : diagnostics.unplannedMinutes
  const missingMinutes = useMemo(() => missingMinutesForDiagnostics(diagnostics), [diagnostics])
  const planStatus = useMemo(
    () => statusView(diagnostics.status, missingMinutes),
    [diagnostics.status, missingMinutes],
  )

  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks])
  const objectiveById = useMemo(() => new Map(objectives.map((o) => [o.id, o])), [objectives])
  void todayStr

  const openEditor = (rule: TimeRule | null) => {
    setEditingRule(rule)
    setEditorOpen(true)
  }

  const handleCreateEntry = async (draft: {
    ruleId: string
    dayOfWeek: number
    startMinute: number
    endMinute: number
  }) => {
    try {
      await saveEntry(draft)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const handleUpdateEntry = async (
    id: string,
    patch: { startMinute: number; endMinute: number },
  ) => {
    const existing = entries.find((e) => e.id === id)
    if (!existing) return
    try {
      await saveEntry({
        id,
        ruleId: existing.ruleId,
        dayOfWeek: existing.dayOfWeek,
        startMinute: patch.startMinute,
        endMinute: patch.endMinute,
      })
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const handleChangeRule = async (id: string, ruleId: string) => {
    const existing = entries.find((e) => e.id === id)
    if (!existing) return
    try {
      await saveEntry({
        id,
        ruleId,
        dayOfWeek: existing.dayOfWeek,
        startMinute: existing.startMinute,
        endMinute: existing.endMinute,
      })
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  if (!loaded) {
    return (
      <PageTransition>
        <PageSkeleton>
          <div className="space-y-2">
            <div className="h-8 w-40 animate-pulse rounded bg-bg-card" />
            <div className="h-3 w-60 animate-pulse rounded bg-bg-card" />
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
            <div className="space-y-2">
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </div>
            <Skeleton className="h-96 rounded-xl" />
          </div>
        </PageSkeleton>
      </PageTransition>
    )
  }

  return (
    <PageTransition>
      <div className="flex h-full flex-col gap-6 overflow-y-auto px-12 pb-16 pt-16">
        <header className="flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Mon planning</h1>
            <p className="mt-2 max-w-2xl text-sm text-text-secondary">
              {
                'Visualise et ajuste ton emploi du temps. Clique sur le calendrier pour modifier tes blocs.'
              }
            </p>
          </div>
          {/* Toggle semaine / mois */}
          <div className="flex items-center gap-1 rounded-lg border border-border-subtle bg-bg-card p-1">
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => setViewMode('week')}
              className={cn(viewMode === 'week' && 'bg-accent text-black')}
            >
              <Calendar size={12} />
              Semaine
            </Button>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => setViewMode('month')}
              className={cn(viewMode === 'month' && 'bg-accent text-black')}
            >
              <Grid3X3 size={12} />
              Mois
            </Button>
          </div>
        </header>

        <section className="space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-text-muted">
            {viewMode === 'month' ? 'Plan généré - mois complet' : 'Plan généré - semaine'}
          </h2>

          <PlanningStatusBanner
            tone={planStatus.tone}
            label={planStatus.label}
            message={planStatus.message}
          />

          <div className="grid gap-3 lg:grid-cols-2">
            <PlanningMetricCard
              label="Temps placé"
              value={durationLabel(displayedPlannedMinutes)}
              description={
                viewMode === 'month'
                  ? 'Somme réelle des blocs dans le mois affiché.'
                  : 'Somme réelle des blocs sur 7 jours.'
              }
            />
            <PlanningMetricCard
              label="Non planifié"
              value={durationLabel(displayedUnplannedMinutes)}
              description={
                viewMode === 'month'
                  ? 'Temps libre réel restant dans le mois affiché.'
                  : 'Temps libre réel restant sur la semaine.'
              }
            />
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowPlanDetails((current) => !current)}
            className="justify-start"
          >
            <ChevronRight
              size={13}
              className={cn('transition-transform duration-200', showPlanDetails && 'rotate-90')}
            />
            Pourquoi ce planning ?
          </Button>

          {showPlanDetails && <PlanningDetails diagnostics={diagnostics} />}
        </section>

        <section>
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-text-muted">
            Règles
          </h2>
          <RuleTable
            rules={rules}
            entries={entries}
            onCreate={() => openEditor(null)}
            onEdit={openEditor}
          />
        </section>

        <section>
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-text-muted">
            {viewMode === 'week' ? 'Semaine' : 'Mois'}
          </h2>

          {viewMode === 'week' ? (
            <WeekCalendar
              rules={rules}
              entries={entries}
              viewport={viewport}
              weekDates={weekDates}
              workBlocks={weekPlacement.blocks}
              placementResults={weekPlacement.placementResults}
              taskById={taskById}
              objectiveById={objectiveById}
              onCreateEntry={handleCreateEntry}
              onUpdateEntry={handleUpdateEntry}
              onChangeRule={handleChangeRule}
              onDeleteEntry={deleteEntry}
              onCreateRule={() => openEditor(null)}
            />
          ) : (
            <FullScreenMonthCalendar
              currentMonth={monthCursor}
              onCurrentMonthChange={setMonthCursor}
              placement={monthPlacement}
              planningStartDate={planningToday}
              planningEndDate={monthBounds.maxPlanningDate}
              minMonth={monthBounds.minMonth}
              maxMonth={monthBounds.maxMonth}
              isPlanningClamped={monthRange.isClamped}
              horizonDays={MONTH_PLANNING_HORIZON_DAYS}
            />
          )}
        </section>
      </div>

      <RuleEditor
        open={editorOpen}
        initial={editingRule}
        profiles={blockingState.profiles}
        onClose={() => setEditorOpen(false)}
        onSave={saveRule}
        onDelete={deleteRule}
      />
    </PageTransition>
  )
}

function PlanningStatusBanner({
  tone,
  label,
  message,
}: {
  tone: PlanningStatusTone
  label: string
  message: string
}): JSX.Element {
  const Icon = tone === 'impossible' ? AlertTriangle : tone === 'risk' ? Info : CheckCircle2
  return (
    <div
      className={cn(
        'info-panel flex items-start gap-3 rounded-2xl px-4 py-3 text-sm',
        tone === 'impossible' && 'border-red-500/40 bg-red-500/10 text-red-100',
        tone === 'risk' && 'border-orange/40 bg-orange/10 text-orange',
        tone === 'ok' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100',
      )}
    >
      <Icon size={17} className="mt-0.5 shrink-0" />
      <div>
        <div className="font-semibold">{label}</div>
        <p
          className={cn(
            'mt-0.5 text-xs',
            tone === 'impossible' && 'text-red-100/85',
            tone === 'risk' && 'text-orange/85',
            tone === 'ok' && 'text-emerald-100/80',
          )}
        >
          {message}
        </p>
      </div>
    </div>
  )
}

function PlanningMetricCard({
  label,
  value,
  description,
}: {
  label: string
  value: string
  description: string
}): JSX.Element {
  return (
    <div className="info-panel rounded-2xl px-5 py-4">
      <div className="text-[10px] font-medium uppercase tracking-widest text-text-muted">
        {label}
      </div>
      <div className="mt-3 text-2xl font-bold tabular-nums text-text-primary">{value}</div>
      <div className="mt-1 text-xs text-text-muted">{description}</div>
    </div>
  )
}

function PlanningDetails({ diagnostics }: { diagnostics: PlacementDiagnostics }): JSX.Element {
  const items = diagnostics.items

  return (
    <div className="info-panel rounded-2xl p-4">
      <div className="grid gap-2 text-xs text-text-secondary sm:grid-cols-3">
        <div>
          <span className="text-text-muted">Temps libre total</span>
          <div className="mt-1 font-semibold text-text-primary">
            {durationLabel(diagnostics.totalFreeMinutes)}
          </div>
        </div>
        <div>
          <span className="text-text-muted">Blocs placés</span>
          <div className="mt-1 font-semibold text-text-primary">
            {durationLabel(diagnostics.plannedMinutes)}
          </div>
        </div>
        <div>
          <span className="text-text-muted">Reste disponible</span>
          <div className="mt-1 font-semibold text-text-primary">
            {durationLabel(diagnostics.unplannedMinutes)}
          </div>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-border-subtle">
        <div className="grid grid-cols-[minmax(0,1fr)_80px_80px_80px] gap-3 border-b border-border-subtle bg-bg-base/60 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          <span>Élément</span>
          <span className="text-right">Demandé</span>
          <span className="text-right">Placé</span>
          <span className="text-right">Reste</span>
        </div>
        {items.length === 0 ? (
          <div className="px-3 py-3 text-xs text-text-muted">
            Aucun objectif ou tâche active à placer.
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item.key}
              className="grid grid-cols-[minmax(0,1fr)_80px_80px_80px] gap-3 border-b border-border-subtle px-3 py-2 text-xs last:border-b-0"
            >
              <div className="min-w-0">
                <div className="truncate font-medium text-text-primary">{item.label}</div>
                <div
                  className={cn(
                    'mt-0.5 text-[10px]',
                    item.status === 'impossible' && 'text-red-300',
                    item.status === 'risk' && 'text-orange',
                    item.status === 'planifiable' && 'text-text-muted',
                  )}
                >
                  {item.status === 'impossible'
                    ? 'Impossible'
                    : item.status === 'risk'
                      ? 'Serré'
                      : 'Planifiable'}
                </div>
              </div>
              <span className="text-right font-mono text-text-secondary">
                {item.requiredMinutes === null ? '-' : durationLabel(item.requiredMinutes)}
              </span>
              <span className="text-right font-mono text-text-primary">
                {durationLabel(itemDisplayedMinutes(item))}
              </span>
              <span className="text-right font-mono text-text-secondary">
                {durationLabel(item.unplannedMinutes)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
