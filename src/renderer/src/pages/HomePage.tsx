import { useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageTransition } from '@/components/PageTransition'
import { TimeCircle } from '@/components/interface/TimeCircle'
import { FreeTimeWidget } from '@/components/levels/FreeTimeWidget'
import { useScheduleStore } from '@/store/schedule.store'
import { useLevelsStore } from '@/store/levels.store'
import { useBlockingStore } from '@/store/blocking.store'
import { entriesForDay, jsDateToDayOfWeek } from '@/lib/schedule-selectors'
import { minuteToHHMM, durationLabel } from '@/lib/format-time'
import { iconByName } from '@/lib/rule-palette'

const DAYS_FR_FULL = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']

export default function HomePage() {
  const { loaded, rules, entries, load } = useScheduleStore()
  const levelsLoaded = useLevelsStore((s) => s.loaded)
  const freeTime = useLevelsStore((s) => s.freeTime)
  const loadLevels = useLevelsStore((s) => s.load)
  const spendFreeTime = useLevelsStore((s) => s.spendFreeTime)
  const reconcile = useLevelsStore((s) => s.reconcileWithHistory)
  const blockingState = useBlockingStore((s) => s.state)
  const loadBlocking = useBlockingStore((s) => s.load)
  const blockingLoaded = useBlockingStore((s) => s.loaded)

  useEffect(() => {
    void load()
    if (!levelsLoaded) void loadLevels()
    if (!blockingLoaded) void loadBlocking()
  }, [load, loadLevels, loadBlocking, levelsLoaded, blockingLoaded])

  // Réconciliation auto au montage et lorsque l'historique change
  useEffect(() => {
    if (!levelsLoaded || !blockingLoaded) return
    void reconcile(blockingState.history, rules)
  }, [levelsLoaded, blockingLoaded, blockingState.history, rules, reconcile])

  const now = useMemo(() => new Date(), [])
  const dow = jsDateToDayOfWeek(now)
  const todayEntries = useMemo(() => entriesForDay(entries, dow), [entries, dow])
  const ruleById = useMemo(() => new Map(rules.map((r) => [r.id, r])), [rules])

  if (!loaded) {
    return (
      <PageTransition>
        <div className="flex h-full items-center justify-center text-sm text-text-muted">
          Chargement…
        </div>
      </PageTransition>
    )
  }

  const isEmpty = entries.length === 0

  return (
    <PageTransition>
      <div className="flex h-full flex-col gap-10 overflow-y-auto px-12 pb-16 pt-16">
        <header>
          <div className="text-xs font-medium uppercase tracking-wider text-text-muted">
            {DAYS_FR_FULL[dow]} · {now.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
          </div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{"Aujourd'hui"}</h1>
        </header>

        <div className="grid grid-cols-1 gap-10 xl:grid-cols-[auto_minmax(0,1fr)_minmax(0,360px)] xl:items-start">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="flex justify-center"
          >
            <TimeCircle rules={rules} entries={entries} size={460} />
          </motion.div>

          <motion.section
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="w-full"
          >
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-text-muted">
              Programme du jour
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
                  return (
                    <motion.li
                      key={e.id}
                      whileHover={{ x: 2 }}
                      className="group flex items-center gap-3 overflow-hidden rounded-lg border border-border-subtle bg-bg-card px-4 py-3"
                    >
                      <div
                        className="h-10 w-1.5 flex-shrink-0 rounded-full"
                        style={{ backgroundColor: rule.color }}
                      />
                      <div
                        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full"
                        style={{ backgroundColor: rule.color + '22', color: rule.color }}
                      >
                        {Icon ? <Icon size={14} /> : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-text-primary">
                          {rule.name}
                        </div>
                        <div className="text-xs text-text-muted">
                          {minuteToHHMM(e.startMinute)} — {minuteToHHMM(e.endMinute)} ·{' '}
                          {durationLabel(e.endMinute - e.startMinute)}
                        </div>
                      </div>
                    </motion.li>
                  )
                })}
              </ul>
            )}
          </motion.section>

          <motion.div
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="w-full"
          >
            <FreeTimeWidget bank={freeTime} onSpend={spendFreeTime} />
          </motion.div>
        </div>
      </div>
    </PageTransition>
  )
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
