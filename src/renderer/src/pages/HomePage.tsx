import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Shield, Clock, Target, BarChart3, Timer, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageTransition } from '@/components/PageTransition'
import { TimeCircle } from '@/components/interface/TimeCircle'
import { PageSkeleton, Skeleton, SkeletonRow } from '@/components/ui/Skeleton'
import { useScheduleStore } from '@/store/schedule.store'
import { useLevelsStore } from '@/store/levels.store'
import { useBlockingStore } from '@/store/blocking.store'
import { useTasksStore } from '@/store/tasks.store'
import { useSettingsStore } from '@/store/settings.store'
import { useRegistryStore } from '@/store/registry.store'
import { entriesForDay, jsDateToDayOfWeek } from '@/lib/schedule-selectors'
import { minuteToClockLabel, durationLabel } from '@/lib/format-time'
import { iconByName } from '@/lib/rule-palette'
import {
  formatAllocatedTime,
  computeFreeTimeSlots,
  parseClockTimeToMinute,
} from '@/lib/free-time-calculator'
import { usePlacement, localDateKey } from '@/lib/use-placement'
import { checkPaletteCollisions } from '@/lib/color-similarity'
import { SLEEP_LOCKDOWN_PROCESS_MARKER } from '@shared/blocking'
import type { BlockingProfile, RegistryItem } from '@shared/schemas'

const DAYS_FR_FULL = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']

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
  const tasksUserId = useTasksStore((s) => s.userId)
  const loadTasks = useTasksStore((s) => s.load)
  const tasksLoaded = useTasksStore((s) => s.loaded)
  const sleepEnd = useSettingsStore((s) => s.sleepEnd)
  const registryItems = useRegistryStore((s) => s.items)
  const registryLoaded = useRegistryStore((s) => s.loaded)
  const loadRegistry = useRegistryStore((s) => s.load)
  const scheduleLoadUserRef = useRef<string | null>(null)
  const [showBlockedApps, setShowBlockedApps] = useState(false)

  useEffect(() => {
    if (!tasksUserId) return
    if (!loaded && scheduleLoadUserRef.current !== tasksUserId) {
      scheduleLoadUserRef.current = tasksUserId
      void load(tasksUserId).finally(() => {
        if (scheduleLoadUserRef.current === tasksUserId) scheduleLoadUserRef.current = null
      })
    }
    if (!levelsLoaded) void loadLevels(tasksUserId)
    if (!blockingLoaded) void loadBlocking(tasksUserId)
    if (!tasksLoaded) void loadTasks(tasksUserId)
    if (!registryLoaded) void loadRegistry(tasksUserId)
  }, [
    load,
    loadLevels,
    loadBlocking,
    loadTasks,
    loadRegistry,
    loaded,
    levelsLoaded,
    blockingLoaded,
    tasksLoaded,
    registryLoaded,
    tasksUserId,
  ])

  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null
    const scheduleFromNextMinute = () => {
      const current = new Date()
      const msUntilNextMinute =
        (60 - current.getSeconds()) * 1000 - current.getMilliseconds()

      return setTimeout(() => {
        setNow(new Date())
        intervalId = setInterval(() => setNow(new Date()), 60_000)
      }, msUntilNextMinute === 0 ? 60_000 : msUntilNextMinute)
    }

    const timeoutId = scheduleFromNextMinute()
    return () => {
      clearTimeout(timeoutId)
      if (intervalId) clearInterval(intervalId)
    }
  }, [])

  const dow = jsDateToDayOfWeek(now)
  const todayStr = localDateKey(now)
  const todayEntries = useMemo(() => entriesForDay(entries, dow), [entries, dow])
  const ruleById = useMemo(() => new Map(rules.map((r) => [r.id, r])), [rules])

  // Current activity
  const currentMinute = now.getHours() * 60 + now.getMinutes()

  // ─── CORE: Time distribution via le moteur unifié ───
  const rangeEnd = useMemo(() => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 6)
    return localDateKey(d)
  }, [now])
  const { blocks } = usePlacement(now, rangeEnd, { todayStartMinute: 0 })
  const todayPlannedBlocks = useMemo(
    () =>
      blocks.filter(
        (b) =>
          b.date === todayStr &&
          (b.kind === 'task' || b.kind === 'objective' || b.kind === 'break'),
      ),
    [blocks, todayStr],
  )

  const todayMinutesByTask = useMemo(() => {
    const m = new Map<string, number>()
    for (const b of blocks) {
      if (b.date !== todayStr || b.kind !== 'task' || !b.refId) continue
      m.set(b.refId, (m.get(b.refId) ?? 0) + (b.endMinute - b.startMinute))
    }
    return m
  }, [blocks, todayStr])
  const todayMinutesByObjective = useMemo(() => {
    const m = new Map<string, number>()
    for (const b of blocks) {
      if (b.date !== todayStr || b.kind !== 'objective' || !b.refId) continue
      m.set(b.refId, (m.get(b.refId) ?? 0) + (b.endMinute - b.startMinute))
    }
    return m
  }, [blocks, todayStr])

  const totalTodayWorkMinutes = useMemo(
    () =>
      blocks
        .filter((b) => b.date === todayStr && (b.kind === 'task' || b.kind === 'objective'))
        .reduce((s, b) => s + (b.endMinute - b.startMinute), 0),
    [blocks, todayStr],
  )

  // Pour la persistance de stats : temps libre brut d'aujourd'hui (somme des
  // créneaux non-préparation), indépendant du nouveau moteur.
  const todayDow = (now.getDay() + 6) % 7
  const todayFreeMinutes = useMemo(() => {
    const slots = computeFreeTimeSlots(todayDow, entries, rules, {
      wakeMinute: parseClockTimeToMinute(sleepEnd),
      morningBufferMinutes: 30,
    })
    return slots.filter((s) => !s.isPreparation).reduce((sum, s) => sum + s.durationMinutes, 0)
  }, [todayDow, entries, rules, sleepEnd])
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

  // Average level
  const avgLevel =
    objectives.length > 0 ? objectives.reduce((sum, o) => sum + o.level, 0) / objectives.length : 0

  // Tasks accomplished
  const activeTasks = useMemo(() => tasks.filter((t) => t.status === 'active'), [tasks])
  const completedToday = useMemo(
    () =>
      tasks.filter(
        (t) => t.status === 'completed' && isSameLocalDate(t.completedAt, todayStr),
      ),
    [tasks, todayStr],
  )
  const sessionRuleProgress = useMemo(
    () => getSessionRuleProgress(blockingState.history, active, now),
    [blockingState.history, active, now],
  )
  const productiveTime = useMemo(
    () => formatProductiveTime(blockingState.history, now),
    [blockingState.history, now],
  )
  const blockedTotals = useMemo(() => {
    const sites = new Set<string>()
    const apps = new Set<string>()

    for (const profile of blockingState.profiles) {
      for (const site of profile.blockedSites) {
        const normalized = normalizeBlockedValue(site)
        if (normalized) sites.add(normalized)
      }
      for (const processName of profile.blockedProcesses) {
        const normalized = normalizeBlockedValue(processName)
        if (normalized) apps.add(normalized)
      }
    }

    return { sites: sites.size, apps: apps.size }
  }, [blockingState.profiles])
  const activeBlockingProfile = useMemo(
    () => blockingState.profiles.find((profile) => profile.id === active?.profileId) ?? null,
    [active?.profileId, blockingState.profiles],
  )
  const blockedAppEntries = useMemo(
    () =>
      resolveBlockedAppEntries(
        active?.profileSnapshot
          ? [active.profileSnapshot]
          : activeBlockingProfile
            ? [activeBlockingProfile]
            : blockingState.profiles,
        registryItems,
      ),
    [active?.profileSnapshot, activeBlockingProfile, blockingState.profiles, registryItems],
  )

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
            {DAYS_FR_FULL[dow]} ·{' '}
            {now.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
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
            <TimeCircle rules={rules} entries={entries} blocks={blocks} size={460} />
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
            ) : todayEntries.length === 0 && todayPlannedBlocks.length === 0 ? (
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
                      className={`info-panel group flex items-center gap-3 rounded-lg px-4 py-3 ${
                        isNow ? 'border-accent/40 bg-accent/5' : ''
                      }`}
                    >
                      <div
                        className="h-10 w-1.5 flex-shrink-0 rounded-2xl"
                        style={{ backgroundColor: display.color, opacity: display.opacity }}
                      />
                      <div
                        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl"
                        style={{
                          backgroundColor:
                            display.color === 'transparent'
                              ? 'rgba(255,255,255,0.06)'
                              : display.color + '22',
                          color:
                            display.color === 'transparent' ? 'var(--text-muted)' : display.color,
                        }}
                      >
                        {Icon ? <Icon size={14} /> : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-text-primary">
                          {rule.name}
                          {isNow && (
                            <span className="ml-2 inline-block h-1.5 w-1.5 animate-pulse rounded-2xl bg-accent" />
                          )}
                        </div>
                        <div className="text-xs text-text-muted">
                          {minuteToClockLabel(e.startMinute)} — {minuteToClockLabel(e.endMinute)} ·{' '}
                          {durationLabel(e.endMinute - e.startMinute)}
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

            {todayMinutesByObjective.size > 0 && (
              <div className="mt-8">
                <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
                  <Target size={14} className="text-accent" />
                  Répartition par objectif (aujourd&apos;hui)
                </h2>
                <div className="flex flex-col gap-2.5">
                  {[...todayMinutesByObjective.entries()].map(([objectiveId, minutes]) => {
                    const obj = objectives.find((o) => o.id === objectiveId)
                    if (!obj) return null
                    return (
                      <div
                        key={objectiveId}
                        className="info-panel group flex items-center justify-between gap-4 rounded-xl p-4 pl-6 transition-all duration-300 hover:-translate-y-0.5 will-change-transform"
                      >
                        {/* Left color bar */}
                        <div
                          className="absolute left-0 top-0 bottom-0 w-1 transition-all group-hover:w-1.5"
                          style={{ backgroundColor: obj.color }}
                        />

                        <div className="relative flex min-w-0 flex-1 items-center gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-text-primary group-hover:text-accent transition-colors">
                              {obj.name}
                            </div>
                            <div className="mt-1 flex items-center gap-2">
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-white/5 border border-border-subtle/50 text-text-muted uppercase">
                                Niveau {obj.level.toFixed(1)}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="relative text-right shrink-0">
                          <div className="text-lg font-bold tabular-nums text-text-primary">
                            {formatAllocatedTime(minutes)}
                          </div>
                          <div className="text-[10px] text-text-muted font-semibold uppercase tracking-wider">
                            alloué
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {todayMinutesByTask.size > 0 && (
              <div className="mt-8">
                <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
                  <Target size={14} className="text-accent" />
                  Ce que tu dois faire aujourd&apos;hui
                </h2>
                <div className="flex flex-col gap-2.5">
                  {[...todayMinutesByTask.entries()].map(([taskId, minutes]) => {
                    const task = tasks.find((t) => t.id === taskId)
                    if (!task) return null
                    const obj = task.linkedObjectiveId
                      ? objectives.find((o) => o.id === task.linkedObjectiveId)
                      : undefined
                    const accentColor = obj ? obj.color : 'var(--accent)'
                    return (
                      <div
                        key={taskId}
                        className="info-panel group flex items-center justify-between gap-4 rounded-xl p-4 pl-6 transition-all duration-300 hover:-translate-y-0.5 will-change-transform"
                      >
                        {/* Left color bar */}
                        <div
                          className="absolute left-0 top-0 bottom-0 w-1 transition-all group-hover:w-1.5"
                          style={{ backgroundColor: accentColor }}
                        />

                        <div className="relative flex min-w-0 flex-1 items-center gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-text-primary group-hover:text-accent transition-colors">
                              {task.title}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-white/5 border border-border-subtle/50 text-text-muted uppercase">
                                Niveau {task.level}
                              </span>
                              {obj && (
                                <span className="inline-flex items-center gap-1 text-[10px] text-text-secondary bg-white/5 border border-border-subtle/50 px-1.5 py-0.5 rounded">
                                  <span
                                    className="h-1.5 w-1.5 rounded-full"
                                    style={{ backgroundColor: obj.color }}
                                  />
                                  {obj.name}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="relative text-right shrink-0">
                          <div className="text-lg font-bold tabular-nums text-text-primary">
                            {formatAllocatedTime(minutes)}
                          </div>
                          <div className="text-[10px] text-text-muted font-semibold uppercase tracking-wider">
                            à travailler
                          </div>
                        </div>
                      </div>
                    )
                  })}
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
            <InfoPanel>
              <div className="flex items-center gap-2">
                <Clock size={16} className="text-yellow" />
                <h3 className="text-xs font-medium uppercase tracking-wider text-text-muted">
                  Temps de travail aujourd&apos;hui
                </h3>
              </div>
              <div className="mt-3 text-3xl font-bold tabular-nums text-text-primary">
                {formatAllocatedTime(totalTodayWorkMinutes)}
              </div>
              <div className="mt-1 text-xs text-text-muted">
                Réparti entre {todayMinutesByTask.size + todayMinutesByObjective.size} item
                {todayMinutesByTask.size + todayMinutesByObjective.size !== 1 ? 's' : ''}
              </div>
            </InfoPanel>

            {/* ─── E. Bloc règles de session actives ─── */}
            <InfoPanel>
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
                  progress={sessionRuleProgress.sameProject}
                />
                <SessionRuleItem
                  label="Max 6h multi-projets"
                  description="Pause 2h obligatoire après"
                  progress={sessionRuleProgress.allProjects}
                />
                <div className="flex items-center gap-2 rounded-lg border border-border-subtle bg-bg-base/50 p-2.5">
                  <Timer size={14} className="text-orange" />
                  <div className="text-[10px] text-text-secondary leading-tight">
                    <strong>Max 2 jours sans temps libre</strong>
                    <br />
                    3ème jour = temps libre obligatoire
                  </div>
                </div>
              </div>
            </InfoPanel>

            {/* ─── F. Bloc blocage ─── */}
            <button
              type="button"
              onClick={() => setShowBlockedApps(true)}
              className="info-panel rounded-xl p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent/40"
            >
              <div className="flex items-center gap-2">
                <Shield size={16} />
                <h3 className="text-xs font-medium uppercase tracking-wider text-text-muted">
                  Blocage
                </h3>
              </div>
              {active ? (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 animate-pulse rounded-2xl bg-red-500" />
                    <span className="text-sm font-semibold text-red-400">BLOCAGE ACTIF</span>
                  </div>
                  <div className="text-xs text-text-muted">
                    Session :{' '}
                    {blockingState.profiles.find((p) => p.id === active.profileId)?.name ?? '—'}
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-2xl bg-text-muted" />
                  <span className="text-sm text-text-secondary">Inactif</span>
                </div>
              )}
              <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border-subtle pt-3">
                <StatMini
                  label="Sites"
                  value={blockedTotals.sites}
                />
                <StatMini
                  label="Apps"
                  value={blockedTotals.apps}
                />
                <StatMini label="Tentatives" value={blockingState.history.length} />
              </div>
              <div className="mt-3 flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-xs text-text-secondary">
                <span>{blockedAppEntries.length} app{blockedAppEntries.length !== 1 ? 's' : ''} à voir</span>
                <span className="text-accent">Ouvrir</span>
              </div>
            </button>

            {/* ─── G. Stats rapides ─── */}
            <InfoPanel>
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
                  value={productiveTime}
                />
                <StatCard
                  icon={<Clock size={14} className="text-yellow" />}
                  label="Temps de travail"
                  value={formatAllocatedTime(totalTodayWorkMinutes)}
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
            </InfoPanel>
          </motion.div>
        </div>

        <AnimatePresence>
          {showBlockedApps && (
            <BlockedAppsDialog
              active={Boolean(activeBlockingProfile)}
              entries={blockedAppEntries}
              onClose={() => setShowBlockedApps(false)}
            />
          )}
        </AnimatePresence>
      </div>
    </PageTransition>
  )
}

// ─── Helper components ──────────────────────────────────────────────────────

function InfoPanel({ children }: { children: React.ReactNode }) {
  return <div className="info-panel rounded-xl p-5">{children}</div>
}

function StatMini({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <div className="text-lg font-bold tabular-nums text-text-primary">{value}</div>
      <div className="text-[10px] text-text-muted">{label}</div>
    </div>
  )
}

type BlockedAppEntry = {
  key: string
  name: string
  processName: string
  iconDataUrl?: string
}

function BlockedAppsDialog({
  active,
  entries,
  onClose,
}: {
  active: boolean
  entries: BlockedAppEntry[]
  onClose: () => void
}) {
  return (
    <motion.div
      className="fixed inset-0 z-[220] flex items-center justify-center bg-black/65 px-6 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0, y: 8 }}
        transition={{ duration: 0.18 }}
        className="info-panel max-h-[78vh] w-full max-w-xl overflow-hidden rounded-2xl bg-bg-elevated shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border-subtle p-5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              Blocage
            </div>
            <h2 className="mt-1 text-xl font-semibold text-text-primary">
              {active ? 'Applications bloquées maintenant' : 'Applications bloquées dans tes profils'}
            </h2>
            <p className="mt-1 text-xs text-text-secondary">
              Liste construite depuis tes règles et les apps détectées localement par Vethos.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border-subtle p-2 text-text-secondary transition-colors hover:bg-white/5 hover:text-text-primary"
            aria-label="Fermer"
          >
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[56vh] overflow-y-auto p-5">
          {entries.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border-subtle p-6 text-center text-sm text-text-secondary">
              Aucune application bloquée à afficher pour l’instant.
            </div>
          ) : (
            <ul className="space-y-2">
              {entries.map((entry) => (
                <li
                  key={entry.key}
                  className="flex items-center gap-3 rounded-xl border border-border-subtle bg-white/[0.03] p-3"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border-subtle bg-bg-base">
                    {entry.iconDataUrl ? (
                      <img
                        src={entry.iconDataUrl}
                        alt=""
                        className="h-8 w-8 object-contain"
                        draggable={false}
                      />
                    ) : (
                      <Shield size={18} className="text-text-muted" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-text-primary">
                      {entry.name}
                    </div>
                    <div className="truncate font-mono text-[11px] text-text-muted">
                      {entry.processName}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="info-panel flex items-center gap-2.5 rounded-lg bg-bg-base px-3 py-2.5">
      {icon}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-text-muted">{label}</div>
        <div className="text-sm font-bold tabular-nums text-text-primary">{value}</div>
      </div>
    </div>
  )
}

function SessionRuleItem({
  label,
  description,
  progress,
}: {
  label: string
  description: string
  progress: number
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-text-primary">{label}</div>
      </div>
      <div className="h-1 w-full rounded-2xl bg-bg-base overflow-hidden">
        <div className="h-full bg-accent" style={{ width: `${progress}%` }} />
      </div>
      <div className="text-[10px] text-text-muted">{description}</div>
    </div>
  )
}

function formatProductiveTime(
  history: Array<{ startedAt: string; endedAt: string; completedNormally: boolean }>,
  now: Date,
): string {
  let totalMin = 0
  for (const h of history) {
    if (!h.completedNormally) continue
    totalMin += minutesOverlappingToday(h.startedAt, h.endedAt, now)
  }
  if (totalMin >= 60) {
    return `${Math.floor(totalMin / 60)}h${String(totalMin % 60).padStart(2, '0')}`
  }
  return `${totalMin}min`
}

function getSessionRuleProgress(
  history: Array<{
    profileId: string
    startedAt: string
    endedAt: string
    completedNormally: boolean
  }>,
  active: { profileId: string; startedAt: string } | null,
  now: Date,
): { sameProject: number; allProjects: number } {
  const byProfile = new Map<string, number>()
  let allMinutes = 0

  for (const entry of history) {
    if (!entry.completedNormally) continue
    const minutes = minutesOverlappingToday(entry.startedAt, entry.endedAt, now)
    allMinutes += minutes
    byProfile.set(entry.profileId, (byProfile.get(entry.profileId) ?? 0) + minutes)
  }

  if (active) {
    const activeMinutes = minutesOverlappingToday(active.startedAt, now, now)
    allMinutes += activeMinutes
    byProfile.set(active.profileId, (byProfile.get(active.profileId) ?? 0) + activeMinutes)
  }

  const sameProjectMinutes = Math.max(0, ...byProfile.values())
  return {
    sameProject: Math.min(100, Math.round((sameProjectMinutes / 240) * 100)),
    allProjects: Math.min(100, Math.round((allMinutes / 360) * 100)),
  }
}

function minutesOverlappingToday(startedAt: string, endedAt: string | Date, now: Date): number {
  const startMs = new Date(startedAt).getTime()
  const endMs = endedAt instanceof Date ? endedAt.getTime() : new Date(endedAt).getTime()
  const nowMs = now.getTime()
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const startOfTodayMs = startOfToday.getTime()

  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    !Number.isFinite(nowMs) ||
    !Number.isFinite(startOfTodayMs)
  ) {
    return 0
  }

  const clippedStart = Math.max(startMs, startOfTodayMs)
  const clippedEnd = Math.min(endMs, nowMs)
  return Math.max(0, Math.round((clippedEnd - clippedStart) / 60_000))
}

function isSameLocalDate(value: string | undefined, dateKey: string): boolean {
  if (!value) return false
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return false
  return localDateKey(date) === dateKey
}

function normalizeBlockedValue(value: string): string {
  return value.trim().toLowerCase()
}

function normalizeProcessName(value: string): string {
  return value.trim().replace(/^.*[\\/]/u, '').toLowerCase()
}

function processDisplayName(processName: string): string {
  const clean = normalizeProcessName(processName).replace(/\.exe$/iu, '')
  if (!clean) return processName
  return clean
    .split(/[\s._-]+/u)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

const INTERNAL_BLOCKED_PROCESS_NAMES = new Set([
  normalizeProcessName(SLEEP_LOCKDOWN_PROCESS_MARKER),
  'vethos.exe',
  'vethos dev.exe',
  'nexus.exe',
  'electron.exe',
  'vethosblockingservice.exe',
  'nexusblockingservice.exe',
])

function isUserFacingBlockedProcess(processName: string): boolean {
  const normalized = normalizeProcessName(processName)
  if (!normalized || INTERNAL_BLOCKED_PROCESS_NAMES.has(normalized)) return false
  if (/^(vethos|nexus).*(lockdown|service|helper|probe)\.exe$/iu.test(normalized)) return false
  return true
}

function registryProcessName(item: RegistryItem): string {
  const executable = item.executableName ? normalizeProcessName(item.executableName) : ''
  if (executable) return executable
  const identifier = normalizeProcessName(item.identifier)
  return identifier.endsWith('.exe') ? identifier : ''
}

function resolveBlockedAppEntries(
  profiles: BlockingProfile[],
  registryItems: RegistryItem[],
): BlockedAppEntry[] {
  const registryApps = registryItems.filter((item) => item.kind === 'app')
  const byExecutable = new Map<string, RegistryItem>()
  for (const item of registryApps) {
    const executable = item.executableName ? normalizeProcessName(item.executableName) : ''
    if (executable && !byExecutable.has(executable)) byExecutable.set(executable, item)
    const identifier = normalizeProcessName(item.identifier)
    if (identifier.endsWith('.exe') && !byExecutable.has(identifier)) byExecutable.set(identifier, item)
  }

  const entries = new Map<string, BlockedAppEntry>()
  for (const profile of profiles) {
    for (const rawProcess of profile.blockedProcesses) {
      const processName = normalizeProcessName(rawProcess)
      if (!isUserFacingBlockedProcess(processName) || entries.has(processName)) continue
      const item = byExecutable.get(processName)
      entries.set(processName, {
        key: processName,
        name: item?.displayName ?? processDisplayName(processName),
        processName,
        iconDataUrl: item?.iconDataUrl,
      })
    }
  }

  if (entries.size === 0) {
    for (const item of registryApps) {
      if (item.blockable === false) continue
      if (item.classified && !item.demoted) continue
      const processName = registryProcessName(item)
      if (!isUserFacingBlockedProcess(processName) || entries.has(processName)) continue
      entries.set(processName, {
        key: processName,
        name: item.displayName,
        processName,
        iconDataUrl: item.iconDataUrl,
      })
    }
  }
  return [...entries.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'))
}

function displayColorForRule(rule: { color: string; categoryType?: string }) {
  if (rule.categoryType === 'sleep') return { color: '#111113', opacity: 1 }
  if (rule.categoryType === 'school') return { color: '#E2E2E2', opacity: 0.72 }
  if (rule.categoryType === 'work') return { color: '#A8A8AC', opacity: 1 }
  if (rule.categoryType === 'free') return { color: 'transparent', opacity: 1 }
  return { color: rule.color, opacity: 1 }
}

function EmptyHint() {
  return (
    <div className="info-panel rounded-lg border-dashed p-6">
      <div className="text-sm font-medium text-text-primary">Pose ta première règle.</div>
      <p className="mt-1 text-xs text-text-secondary">
        {
          'Ouvre Mon planning pour créer une règle (couleur + label) et dessine tes blocs de temps. Le cercle 24h se peuplera automatiquement.'
        }
      </p>
      <Link
        to="/planning"
        className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-black transition-colors hover:bg-accent-hover"
      >
        Aller au planning <ArrowRight size={12} strokeWidth={2.5} />
      </Link>
    </div>
  )
}
