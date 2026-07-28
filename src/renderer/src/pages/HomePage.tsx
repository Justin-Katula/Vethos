import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, Clock, Target, BarChart3 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageTransition } from '@/components/PageTransition'
import { TimeCircle } from '@/components/interface/TimeCircle'
import { PageSkeleton, Skeleton, SkeletonRow } from '@/components/ui/Skeleton'
import { useScheduleStore } from '@/store/schedule.store'
import { useLevelsStore } from '@/store/levels.store'
import { useTasksStore } from '@/store/tasks.store'
import { entriesForDay, jsDateToDayOfWeek } from '@/lib/schedule-selectors'
import { minuteToClockLabel, durationLabel } from '@/lib/format-time'
import { iconByName } from '@/lib/rule-palette'
import { formatAllocatedTime, computeFreeTimeSlots } from '@/lib/free-time-calculator'
import { checkPaletteCollisions } from '@/lib/color-similarity'

const DAYS_FR_FULL = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']

function localDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function HomePage() {
  const { loaded, rules, entries, load } = useScheduleStore()
  const levelsLoaded = useLevelsStore((s) => s.loaded)
  const objectives = useLevelsStore((s) => s.objectives)
  const loadLevels = useLevelsStore((s) => s.load)
  const setCalculatedFreeTime = useLevelsStore((s) => s.setCalculatedFreeTime)
  const tasks = useTasksStore((s) => s.tasks)
  const loadTasks = useTasksStore((s) => s.load)
  const tasksLoaded = useTasksStore((s) => s.loaded)

  useEffect(() => {
    void load()
    if (!levelsLoaded) void loadLevels()
    if (!tasksLoaded) void loadTasks()
  }, [load, loadLevels, loadTasks, levelsLoaded, tasksLoaded])

  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const dow = jsDateToDayOfWeek(now)
  const todayStr = localDateKey(now)
  const todayEntries = useMemo(() => entriesForDay(entries, dow), [entries, dow])
  const ruleById = useMemo(() => new Map(rules.map((r) => [r.id, r])), [rules])

  // Current activity
  const currentMinute = now.getHours() * 60 + now.getMinutes()
  const currentEntry = todayEntries.find(
    (e) => currentMinute >= e.startMinute && currentMinute < e.endMinute,
  )
  const currentRule = currentEntry ? ruleById.get(currentEntry.ruleId) : null
  const currentObjective = currentRule
    ? objectives.find((objective) => objective.linkedRuleIds.includes(currentRule.id))
    : undefined

  // ─── CORE: Time distribution — moteur de placement supprimé (schema redesign).
  // Les blocs placés (todayMinutesByTask, todayMinutesByObjective, totalTodayWorkMinutes)
  // sont retirés tant que le nouveau moteur n'est pas rebâti. On conserve juste
  // le calcul brut du temps libre pour la persistance des stats.

  // Pour la persistance de stats : temps libre brut d'aujourd'hui (somme des
  // créneaux non-préparation), indépendant du nouveau moteur.
  const todayDow = (now.getDay() + 6) % 7
  const todayFreeMinutes = useMemo(() => {
    const slots = computeFreeTimeSlots(todayDow, entries, rules)
    return slots.filter((s) => !s.isPreparation).reduce((sum, s) => sum + s.durationMinutes, 0)
  }, [todayDow, entries, rules])
  const colorCollisions = useMemo(() => {
    const colors = todayEntries
      .map((entry) => ruleById.get(entry.ruleId))
      .filter((rule): rule is NonNullable<typeof rule> => Boolean(rule))
      .map((rule) => displayColorForRule(rule).color)
      .filter((color) => color !== 'transparent')
    return checkPaletteCollisions(colors)
  }, [ruleById, todayEntries])

  useEffect(() => {
    if (!loaded || !tasksLoaded) return
    void setCalculatedFreeTime(todayFreeMinutes, todayStr)
  }, [loaded, tasksLoaded, todayFreeMinutes, todayStr, setCalculatedFreeTime])

  // Tasks accomplished
  const activeTasks = tasks.filter((t) => t.status === 'active')
  const completedToday = tasks.filter((t) => t.status === 'history')

  if (!loaded) {
    return (
      <PageTransition>
        <PageSkeleton>
          <div className="grid grid-cols-1 gap-8 xl:grid-cols-[auto_minmax(0,1fr)_minmax(0,360px)]">
            <Skeleton className="h-72 w-72 rounded-2xl" />
            <div className="space-y-2">
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </div>
            <Skeleton className="h-64 rounded-xl" />
          </div>
        </PageSkeleton>
      </PageTransition>
    )
  }

  const isEmpty = entries.length === 0

  return (
    <PageTransition>
      <div className="flex h-full flex-col gap-8 overflow-y-auto px-12 pb-16 pt-16">
        <header>
          <div className="text-xs font-medium uppercase tracking-wider text-text-muted">
            {DAYS_FR_FULL[dow]} · {now.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
          </div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{"Aujourd'hui"}</h1>
        </header>

        <div className="grid grid-cols-1 gap-8 xl:grid-cols-[auto_minmax(0,1fr)_minmax(0,360px)] xl:items-start">
          {/* ─── A. Cercle 24h ─── */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col items-center gap-4"
          >
            <TimeCircle rules={rules} entries={entries} size={460} />

            {/* ─── B. Texte sous le cercle: "Maintenant" ─── */}
            <div className="text-center">
              <div className="text-[10px] font-medium uppercase tracking-widest text-text-muted">
                Maintenant
              </div>
              <div className="mt-1 text-xl font-bold text-text-primary">
                {currentRule ? (
                  <span style={{ color: currentRule.color }}>{currentRule.name}</span>
                ) : (
                  <span className="text-text-muted">Temps libre</span>
                )}
              </div>
              {currentRule && currentEntry && (
                <div className="mt-0.5 text-xs text-text-muted">
                  {currentObjective
                    ? `${currentObjective.name}`
                    : `${minuteToClockLabel(currentEntry.startMinute)} — ${minuteToClockLabel(currentEntry.endMinute)}`}
                </div>
              )}
            </div>
          </motion.div>

          {/* ─── D. Légende + Distribution du temps ─── */}
          <motion.section
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25, delay: 0.1 }}
            className="w-full"
          >
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-text-muted">
              Légende du jour
            </h2>

            {isEmpty ? (
              <EmptyHint />
            ) : todayEntries.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border-subtle p-6 text-center text-sm text-text-muted">
                {"Aucun bloc prévu aujourd'hui. Rendez-vous au planning."}
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {todayEntries.map((e) => {
                  const rule = ruleById.get(e.ruleId)
                  if (!rule) return null
                  const Icon = iconByName(rule.icon)
                  const isNow = currentMinute >= e.startMinute && currentMinute < e.endMinute
                  const display = displayColorForRule(rule)
                  return (
                    <motion.li
                      key={e.id}
                      whileHover={{ x: 2 }}
                      className={`group flex items-center gap-3 overflow-hidden rounded-lg border px-4 py-3 ${
                        isNow
                          ? 'border-accent/40 bg-accent/5'
                          : 'border-border-subtle bg-bg-card'
                      }`}
                    >
                      <div className="h-10 w-1.5 flex-shrink-0 rounded-2xl" style={{ backgroundColor: display.color, opacity: display.opacity }} />
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl" style={{ backgroundColor: display.color === 'transparent' ? 'rgba(255,255,255,0.06)' : display.color + '22', color: display.color === 'transparent' ? 'var(--text-muted)' : display.color }}>
                        {Icon ? <Icon size={14} /> : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-text-primary">
                          {rule.name}
                          {isNow && <span className="ml-2 inline-block h-1.5 w-1.5 animate-pulse rounded-2xl bg-accent" />}
                        </div>
                        <div className="text-xs text-text-muted">
                          {minuteToClockLabel(e.startMinute)} — {minuteToClockLabel(e.endMinute)} · {durationLabel(e.endMinute - e.startMinute)}
                        </div>
                      </div>
                    </motion.li>
                  )
                })}
              </ul>
            )}
            {colorCollisions.length > 0 && (
              <div className="mt-3 rounded-lg border border-orange/40 bg-orange/10 px-3 py-2 text-xs text-orange">
                Attention : certaines couleurs se ressemblent.
              </div>
            )}

            {/* Sections « répartition par objectif / tâche » retirées :
                elles dépendaient du moteur de placement (usePlacement) supprimé
                lors du redesign du schema. Elles seront rebâties plus tard. */}
          </motion.section>

          {/* ─── Colonne droite ─── */}
          <motion.div
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25, delay: 0.2 }}
            className="flex w-full flex-col gap-4"
          >
            {/* ─── C. Temps libre disponible ─── */}
            <div className="rounded-xl border border-border-subtle bg-bg-card p-5">
              <div className="flex items-center gap-2">
                <Clock size={16} className="text-yellow" />
                <h3 className="text-xs font-medium uppercase tracking-wider text-text-muted">
                  Temps libre aujourd&apos;hui
                </h3>
              </div>
              <div className="mt-3 text-3xl font-bold tabular-nums text-text-primary">
                {formatAllocatedTime(todayFreeMinutes)}
              </div>
              <div className="mt-1 text-xs text-text-muted">
                Calculé depuis ton emploi du temps.
              </div>
            </div>

            {/* ─── G. Stats rapides ─── */}
            <div className="rounded-xl border border-border-subtle bg-bg-card p-5">
              <div className="flex items-center gap-2">
                <BarChart3 size={16} />
                <h3 className="text-xs font-medium uppercase tracking-wider text-text-muted">
                  Stats rapides
                </h3>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <StatCard
                  icon={<Clock size={14} className="text-yellow" />}
                  label="Temps libre"
                  value={formatAllocatedTime(todayFreeMinutes)}
                />
                <StatCard
                  icon={<Target size={14} className="text-cyan" />}
                  label="Tâches"
                  value={`${completedToday.length}/${activeTasks.length + completedToday.length}`}
                />
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </PageTransition>
  )
}



// ─── Helper components ──────────────────────────────────────────────────────

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border-subtle bg-bg-base px-3 py-2.5">
      {icon}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-text-muted">{label}</div>
        <div className="text-sm font-bold tabular-nums text-text-primary">{value}</div>
      </div>
    </div>
  )
}

function displayColorForRule(rule: { color: string; categoryType?: string }) {
  if (rule.categoryType === 'sleep') return { color: '#1E3A8A', opacity: 1 }
  if (rule.categoryType === 'school') return { color: '#FFFFFF', opacity: 0.7 }
  if (rule.categoryType === 'work') return { color: '#3BA3FF', opacity: 1 }
  if (rule.categoryType === 'free') return { color: 'transparent', opacity: 1 }
  return { color: rule.color, opacity: 1 }
}

function EmptyHint() {
  return (
    <div className="rounded-lg border border-dashed border-border-subtle bg-bg-card p-6">
      <div className="text-sm font-medium text-text-primary">Pose ta première règle.</div>
      <p className="mt-1 text-xs text-text-secondary">
        {"Ouvre Mon planning pour créer une règle (couleur + label) et dessine tes blocs de temps. Le cercle 24h se peuplera automatiquement."}
      </p>
      <Link
        to="/planning"
        className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-hover"
      >
        Aller au planning <ArrowRight size={12} strokeWidth={2.5} />
      </Link>
    </div>
  )
}
