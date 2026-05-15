import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, Shield, Clock, Target, BarChart3, Timer } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageTransition } from '@/components/PageTransition'
import { TimeCircle } from '@/components/interface/TimeCircle'
import { PageSkeleton, Skeleton, SkeletonRow } from '@/components/ui/Skeleton'
import { useScheduleStore } from '@/store/schedule.store'
import { useLevelsStore } from '@/store/levels.store'
import { useBlockingStore } from '@/store/blocking.store'
import { useTasksStore } from '@/store/tasks.store'
import { entriesForDay, jsDateToDayOfWeek } from '@/lib/schedule-selectors'
import { minuteToHHMM, durationLabel } from '@/lib/format-time'
import { iconByName } from '@/lib/rule-palette'
import {
  computeDailyFreeTime,
  formatAllocatedTime,
  type TimeDistribution,
} from '@/lib/free-time-calculator'
import { cn } from '@/lib/cn'

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
  const blockingState = useBlockingStore((s) => s.state)
  const active = useBlockingStore((s) => s.active)
  const loadBlocking = useBlockingStore((s) => s.load)
  const blockingLoaded = useBlockingStore((s) => s.loaded)
  const tasks = useTasksStore((s) => s.tasks)
  const loadTasks = useTasksStore((s) => s.load)
  const tasksLoaded = useTasksStore((s) => s.loaded)

  useEffect(() => {
    void load()
    if (!levelsLoaded) void loadLevels()
    if (!blockingLoaded) void loadBlocking()
    if (!tasksLoaded) void loadTasks()
  }, [load, loadLevels, loadBlocking, loadTasks, levelsLoaded, blockingLoaded, tasksLoaded])

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

  // ─── CORE: Time distribution calculation ───
  const dailyResult = useMemo(
    () => computeDailyFreeTime(dow, entries, rules, tasks, todayStr),
    [dow, entries, rules, tasks, todayStr],
  )

  useEffect(() => {
    if (!loaded || !tasksLoaded) return
    void setCalculatedFreeTime(dailyResult.totalFreeMinutes, todayStr)
  }, [loaded, tasksLoaded, dailyResult.totalFreeMinutes, todayStr, setCalculatedFreeTime])

  // Average level
  const avgLevel =
    objectives.length > 0
      ? objectives.reduce((sum, o) => sum + o.level, 0) / objectives.length
      : 0

  // Tasks accomplished
  const activeTasks = tasks.filter((t) => t.status === 'active')
  const completedToday = tasks.filter((t) => t.status === 'history')

  if (!loaded) {
    return (
      <PageTransition>
        <PageSkeleton>
          <div className="grid grid-cols-1 gap-8 xl:grid-cols-[auto_minmax(0,1fr)_minmax(0,360px)]">
            <Skeleton className="h-72 w-72 rounded-full" />
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
                  Niveau {currentRule ? '—' : '—'} · {minuteToHHMM(currentEntry.startMinute)} — {minuteToHHMM(currentEntry.endMinute)}
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
                      <div className="h-10 w-1.5 flex-shrink-0 rounded-full" style={{ backgroundColor: rule.color }} />
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: rule.color + '22', color: rule.color }}>
                        {Icon ? <Icon size={14} /> : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-text-primary">
                          {rule.name}
                          {isNow && <span className="ml-2 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />}
                        </div>
                        <div className="text-xs text-text-muted">
                          {minuteToHHMM(e.startMinute)} — {minuteToHHMM(e.endMinute)} · {durationLabel(e.endMinute - e.startMinute)}
                        </div>
                      </div>
                    </motion.li>
                  )
                })}
              </ul>
            )}

            {/* ─── DISTRIBUTION DU TEMPS — LE CŒUR ─── */}
            {dailyResult.distributions.length > 0 && (
              <div className="mt-8">
                <h2 className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-text-muted">
                  <Target size={14} />
                  Ce que tu dois faire aujourd&apos;hui
                </h2>
                <div className="flex flex-col gap-2">
                  {dailyResult.distributions.map((dist) => (
                    <DistributionCard key={dist.taskId} dist={dist} />
                  ))}
                </div>
              </div>
            )}
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
                {formatAllocatedTime(dailyResult.totalFreeMinutes)}
              </div>
              <div className="mt-1 text-xs text-text-muted">
                Réparti entre {dailyResult.distributions.length} tâche{dailyResult.distributions.length !== 1 ? 's' : ''}
              </div>
            </div>

            {/* ─── E. Bloc règles de session actives ─── */}
            <div className="rounded-xl border border-border-subtle bg-bg-card p-5">
              <div className="flex items-center gap-2">
                <Clock size={16} />
                <h3 className="text-xs font-medium uppercase tracking-wider text-text-muted">
                  Règles de session actives
                </h3>
              </div>
              <div className="mt-4 space-y-3">
                <SessionRuleItem
                  label="Max 4h même projet"
                  description="Pause 1h obligatoire après"
                  progress={0}
                />
                <SessionRuleItem
                  label="Max 6h multi-projets"
                  description="Pause 2h obligatoire après"
                  progress={0}
                />
                <div className="flex items-center gap-2 rounded-lg border border-border-subtle bg-bg-base/50 p-2.5">
                  <Timer size={14} className="text-orange" />
                  <div className="text-[10px] text-text-secondary leading-tight">
                    <strong>Max 2 jours sans temps libre</strong><br/>
                    3ème jour = temps libre obligatoire
                  </div>
                </div>
              </div>
            </div>

            {/* ─── F. Bloc blocage ─── */}
            <div className="rounded-xl border border-border-subtle bg-bg-card p-5">
              <div className="flex items-center gap-2">
                <Shield size={16} />
                <h3 className="text-xs font-medium uppercase tracking-wider text-text-muted">
                  Blocage
                </h3>
              </div>
              {active ? (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
                    <span className="text-sm font-semibold text-red-400">BLOCAGE ACTIF</span>
                  </div>
                  <div className="text-xs text-text-muted">
                    Session : {blockingState.profiles.find((p) => p.id === active.profileId)?.name ?? '—'}
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-text-muted" />
                  <span className="text-sm text-text-secondary">Inactif</span>
                </div>
              )}
              <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border-subtle pt-3">
                <StatMini label="Sites" value={blockingState.profiles.reduce((s, p) => s + p.blockedSites.length, 0)} />
                <StatMini label="Apps" value={blockingState.profiles.reduce((s, p) => s + p.blockedProcesses.length, 0)} />
                <StatMini label="Tentatives" value={blockingState.history.length} />
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
                  icon={<Timer size={14} className="text-accent" />}
                  label="Temps productif"
                  value={formatProductiveTime(blockingState.history)}
                />
                <StatCard
                  icon={<Clock size={14} className="text-yellow" />}
                  label="Temps libre"
                  value={formatAllocatedTime(dailyResult.totalFreeMinutes)}
                />
                <StatCard
                  icon={<Target size={14} className="text-cyan" />}
                  label="Tâches"
                  value={`${completedToday.length}/${activeTasks.length + completedToday.length}`}
                />
                <StatCard
                  icon={<BarChart3 size={14} className="text-orange" />}
                  label="Niveau moyen"
                  value={avgLevel.toFixed(1)}
                />
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </PageTransition>
  )
}

// ─── Distribution card ──────────────────────────────────────────────────────

function DistributionCard({ dist }: { dist: TimeDistribution }) {
  const urgencyColor =
    dist.deadlineDays <= 1
      ? 'text-red-400 bg-red-500/10 border-red-500/30'
      : dist.deadlineDays <= 3
      ? 'text-orange bg-orange/10 border-orange/30'
      : 'text-text-secondary bg-bg-card border-border-subtle'

  const deadlineLabel =
    dist.deadlineDays <= 0
      ? 'En retard !'
      : dist.deadlineDays === 1
      ? 'Demain'
      : `${dist.deadlineDays} jours`

  return (
    <motion.div
      whileHover={{ x: 2 }}
      className={cn(
        'flex items-center justify-between gap-4 rounded-xl border p-4 transition-colors',
        urgencyColor,
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-text-primary">{dist.taskTitle}</div>
        <div className="mt-0.5 flex items-center gap-2 text-[10px]">
          <span>Niveau {dist.level}</span>
          <span>·</span>
          <span>{deadlineLabel}</span>
          <span>·</span>
          <span>Score: {dist.scoreReel.toFixed(1)}</span>
        </div>
      </div>
      <div className="text-right">
        <div className="text-lg font-bold tabular-nums text-text-primary">
          {formatAllocatedTime(dist.allocatedMinutes)}
        </div>
        <div className="text-[10px] text-text-muted">à travailler</div>
      </div>
    </motion.div>
  )
}

// ─── Helper components ──────────────────────────────────────────────────────

function StatMini({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <div className="text-lg font-bold tabular-nums text-text-primary">{value}</div>
      <div className="text-[10px] text-text-muted">{label}</div>
    </div>
  )
}

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

function SessionRuleItem({ label, description, progress }: { label: string; description: string; progress: number }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-text-primary">{label}</div>
      </div>
      <div className="h-1 w-full rounded-full bg-bg-base overflow-hidden">
        <div className="h-full bg-accent" style={{ width: `${progress}%` }} />
      </div>
      <div className="text-[10px] text-text-muted">{description}</div>
    </div>
  )
}

function formatProductiveTime(
  history: Array<{ startedAt: string; endedAt: string; completedNormally: boolean }>,
): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  let totalMin = 0
  for (const h of history) {
    if (!h.completedNormally) continue
    const ended = new Date(h.endedAt)
    if (ended < today) continue
    const start = new Date(h.startedAt)
    totalMin += Math.max(0, Math.round((ended.getTime() - start.getTime()) / 60000))
  }
  if (totalMin >= 60) {
    return `${Math.floor(totalMin / 60)}h${String(totalMin % 60).padStart(2, '0')}`
  }
  return `${totalMin}min`
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
