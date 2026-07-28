import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Calendar, Grid3X3 } from 'lucide-react'
import { PageTransition } from '@/components/PageTransition'
import { RuleTable } from '@/components/interface/RuleTable'
import { WeekCalendar } from '@/components/interface/WeekCalendar'
import { RuleEditor } from '@/components/interface/RuleEditor'
import { PageSkeleton, Skeleton, SkeletonRow } from '@/components/ui/Skeleton'
import { useScheduleStore } from '@/store/schedule.store'
import { useToast } from '@/lib/use-toast'
import { cn } from '@/lib/cn'
import type { TimeRule } from '@shared/schemas'
import { viewportFromSettings } from '@/lib/calendar-viewport'
import { useSettingsStore } from '@/store/settings.store'

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

  useEffect(() => {
    void load()
  }, [load])

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
              onCreateEntry={handleCreateEntry}
              onUpdateEntry={handleUpdateEntry}
              onChangeRule={handleChangeRule}
              onDeleteEntry={deleteEntry}
              onCreateRule={() => openEditor(null)}
            />
          ) : (
            <MonthView now={now} />
          )}
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
