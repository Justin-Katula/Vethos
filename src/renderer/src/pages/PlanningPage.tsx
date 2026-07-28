import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Calendar, Grid3X3, CheckCircle2, AlertTriangle, Gauge } from 'lucide-react'
import { PageTransition } from '@/components/PageTransition'
import { RuleTable } from '@/components/interface/RuleTable'
import { WeekCalendar } from '@/components/interface/WeekCalendar'
import { RuleEditor } from '@/components/interface/RuleEditor'
import { PageSkeleton, Skeleton, SkeletonRow } from '@/components/ui/Skeleton'
import { useScheduleStore } from '@/store/schedule.store'
import { useLevelsStore } from '@/store/levels.store'
import { usePlanning } from '@/lib/use-planning'
import { useToast } from '@/lib/use-toast'
import { cn } from '@/lib/cn'
import { formatAllocatedTime } from '@/lib/free-time-calculator'
import type { TimeRule } from '@shared/schemas'
import { viewportFromSettings } from '@/lib/calendar-viewport'
import { useSettingsStore } from '@/store/settings.store'
import type { DayCapacity, FeasibilityResult } from '@/lib/planning/types'

function localDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function PlanningPage() {
  const {
    loaded,
    rules,
    entries,
    load,
    saveRule,
    deleteRule,
    saveEntry,
    deleteEntry,
  } = useScheduleStore()
  const toast = useToast()

  const [editorOpen, setEditorOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<TimeRule | null>(null)
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week')

  const sleepStart = useSettingsStore((s) => s.sleepStart)
  const sleepEnd = useSettingsStore((s) => s.sleepEnd)
  const objectives = useLevelsStore((s) => s.objectives)
  const loadLevels = useLevelsStore((s) => s.load)
  const levelsLoaded = useLevelsStore((s) => s.loaded)

  useEffect(() => {
    void load()
    if (!levelsLoaded) void loadLevels()
  }, [load, loadLevels, levelsLoaded])

  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const weekDates = useMemo(() => {
    const dow = (now.getDay() + 6) % 7
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow)
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)
      return localDateKey(d)
    })
  }, [now])

  const viewport = useMemo(() => viewportFromSettings(sleepStart, sleepEnd), [sleepStart, sleepEnd])

  // ─── Nouveau moteur de planification ──────────────────────────────────────
  const plan = usePlanning(now)
  const objectiveColorByRefId = useMemo(() => {
    const map: Record<string, string> = {}
    for (const o of objectives) map[o.id] = o.color
    return map
  }, [objectives])
  const weekCapacities = useMemo(
    () =>
      (plan?.capacities ?? []).filter((c) => weekDates.includes(c.date)),
    [plan, weekDates],
  )
  const feasibility = plan?.feasibility

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
              {"Visualise et ajuste ton emploi du temps. Clique sur le calendrier pour modifier tes blocs."}
            </p>
          </div>
          {/* Toggle semaine / mois */}
          <div className="flex items-center gap-1 rounded-lg border border-border-subtle bg-bg-card p-1">
            <button
              type="button"
              onClick={() => setViewMode('week')}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                viewMode === 'week'
                  ? 'bg-accent text-white'
                  : 'text-text-secondary hover:text-text-primary',
              )}
            >
              <Calendar size={12} />
              Semaine
            </button>
            <button
              type="button"
              onClick={() => setViewMode('month')}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                viewMode === 'month'
                  ? 'bg-accent text-white'
                  : 'text-text-secondary hover:text-text-primary',
              )}
            >
              <Grid3X3 size={12} />
              Mois
            </button>
          </div>
        </header>

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
              now={now}
              blocks={plan?.blocks}
              objectiveColorByRefId={objectiveColorByRefId}
              onCreateEntry={handleCreateEntry}
              onUpdateEntry={handleUpdateEntry}
              onChangeRule={handleChangeRule}
              onDeleteEntry={deleteEntry}
              onCreateRule={() => openEditor(null)}
            />
          ) : (
            <MonthView now={now} />
          )}

          {/* ─── Capacités & faisabilité (moteur de planification) ─── */}
          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <CapacitiesCard
              capacities={weekCapacities}
              today={localDateKey(now)}
            />
            <FeasibilityCard feasibility={feasibility} />
          </div>
        </section>
      </div>

      <RuleEditor
        open={editorOpen}
        initial={editingRule}
        onClose={() => setEditorOpen(false)}
        onSave={saveRule}
        onDelete={deleteRule}
      />
    </PageTransition>
  )
}

// ─── Vue mois ───────────────────────────────────────────────────────────────

function MonthView({ now }: { now: Date }) {
  const year = now.getFullYear()
  const month = now.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const daysInMonth = lastDay.getDate()

  // Placement & heatmap supprimés (schema redesign). La vue mois affiche
  // désormais un simple calendrier sans coloration de charge.
  const todayStr = localDateKey(now)
  const todayDayOfMonth = now.getMonth() === month ? now.getDate() : -1

  const firstDayOfWeek = (firstDay.getDay() + 6) % 7

  const DAYS_HEADER = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
  const MONTH_NAMES = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
  ]

  const cells: (number | null)[] = []
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  function dateStrFor(day: number): string {
    const d = new Date(year, month, day)
    return localDateKey(d)
  }

  return (
    <div className="rounded-xl border border-border-subtle bg-bg-card p-5">
      <div className="mb-4 text-center text-sm font-semibold text-text-primary">
        {MONTH_NAMES[month]} {year}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {DAYS_HEADER.map((d, i) => (
          <div key={i} className="py-2 text-center text-[10px] font-medium uppercase tracking-widest text-text-muted">
            {d}
          </div>
        ))}
        {cells.map((day, i) => {
          if (day === null) {
            return <div key={i} className="h-12" />
          }
          const isToday = day === todayDayOfMonth
          const dStr = dateStrFor(day)
          const isPast = dStr < todayStr
          return (
            <motion.div
              key={i}
              whileHover={{ scale: 1.05 }}
              className={cn(
                'flex h-12 items-center justify-center rounded-lg text-sm font-medium transition-colors',
                isPast ? 'text-text-muted' : 'text-text-primary',
                isToday && 'ring-2 ring-accent ring-offset-1 ring-offset-bg-card',
              )}
            >
              {day}
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Capacités par jour (A) ────────────────────────────────────────────────

function CapacitiesCard({
  capacities,
  today,
}: {
  capacities: DayCapacity[]
  today: string
}): JSX.Element {
  const DAYS_FR_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
  return (
    <div className="rounded-xl border border-border-subtle bg-bg-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <Gauge size={16} className="text-yellow" />
        <h3 className="text-xs font-medium uppercase tracking-wider text-text-muted">
          Capacité utilisable / jour
        </h3>
      </div>
      {capacities.length === 0 ? (
        <div className="text-xs text-text-muted">Calcul en cours…</div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {capacities.map((c, i) => {
            const isToday = c.date === today
            return (
              <li
                key={c.date}
                className={cn(
                  'flex items-center justify-between rounded-md px-2.5 py-1.5 text-xs',
                  isToday ? 'bg-accent/5 ring-1 ring-accent/30' : 'bg-bg-base',
                )}
              >
                <span className="font-medium text-text-secondary">
                  {DAYS_FR_SHORT[i] ?? c.date}
                  <span className="ml-1.5 text-text-muted">{c.date.slice(5)}</span>
                </span>
                <span className="font-bold tabular-nums text-text-primary">
                  {formatAllocatedTime(c.usableCapacityMinutes)}
                </span>
              </li>
            )
          })}
        </ul>
      )}
      <p className="mt-2 text-[10px] text-text-muted">
        Capacité brute cumulée sur la semaine :{' '}
        {formatAllocatedTime(capacities.reduce((s, c) => s + c.rawCapacityMinutes, 0))}
      </p>
    </div>
  )
}

// ─── Faisabilité (C) ───────────────────────────────────────────────────────

function FeasibilityCard({
  feasibility,
}: {
  feasibility: FeasibilityResult | undefined
}): JSX.Element {
  if (!feasibility) {
    return (
      <div className="rounded-xl border border-border-subtle bg-bg-card p-5">
        <div className="mb-3 flex items-center gap-2 text-text-muted">
          <AlertTriangle size={16} />
          <h3 className="text-xs font-medium uppercase tracking-wider">Faisabilité</h3>
        </div>
        <div className="text-xs text-text-muted">Calcul en cours…</div>
      </div>
    )
  }
  const feasible = feasibility.globallyFeasible
  return (
    <div
      className={cn(
        'rounded-xl border p-5',
        feasible ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/40 bg-red-500/5',
      )}
    >
      <div className="mb-3 flex items-center gap-2">
        {feasible ? (
          <CheckCircle2 size={16} className="text-emerald-500" />
        ) : (
          <AlertTriangle size={16} className="text-red-500" />
        )}
        <h3
          className={cn(
            'text-xs font-medium uppercase tracking-wider',
            feasible ? 'text-emerald-500' : 'text-red-500',
          )}
        >
          Faisabilité
        </h3>
      </div>
      <div className="text-sm font-medium text-text-primary">
        {feasible ? 'Plan réaliste sur la semaine' : 'Surcharge détectée'}
      </div>
      {feasibility.densities.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {feasibility.densities.map((d) => (
            <li key={d.deadline} className="flex items-center justify-between text-xs">
              <span className="text-text-secondary">
                {d.deadline} · densité {(d.density * 100).toFixed(0)}%
              </span>
              <span
                className={cn(
                  'font-medium',
                  d.feasible ? 'text-emerald-500' : 'text-red-400',
                )}
              >
                {formatAllocatedTime(d.loadMinutes)} / {formatAllocatedTime(d.capacityMinutes)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {feasibility.deficits.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {feasibility.deficits.map((d) => (
            <li key={d.deadline} className="text-xs text-red-400">
              <span className="font-bold uppercase">{d.severity}</span> · {d.deadline} : −
              {d.deficitMinutes} min
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
