import { useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Target, CheckCircle2, ShieldCheck, Clock, Award, Activity } from 'lucide-react'
import { PageTransition } from '@/components/PageTransition'
import { useTasksStore } from '@/store/tasks.store'
import { useLevelsStore } from '@/store/levels.store'
import { useBlockingStore } from '@/store/blocking.store'
import { PageSkeleton, SkeletonCard } from '@/components/ui/Skeleton'
import { useDecisionLogStore } from '@/store/decision-log.store'
import type { DecisionLogEntry } from '@shared/engine-results'

export default function StatisticsPage() {
  const { loaded: tasksLoaded, tasks, load: loadTasks, userId } = useTasksStore()
  const { loaded: levelsLoaded, objectives, load: loadLevels } = useLevelsStore()
  const { loaded: blockingLoaded, state: blockingState, load: loadBlocking } = useBlockingStore()
  const decisionEntries = useDecisionLogStore((state) => state.entries)
  const decisionLogLoaded = useDecisionLogStore((state) => state.loaded)
  const loadDecisionLog = useDecisionLogStore((state) => state.load)

  useEffect(() => {
    if (!userId) return
    void loadTasks(userId)
    void loadLevels(userId)
    void loadBlocking(userId)
    void loadDecisionLog(userId)
  }, [loadTasks, loadLevels, loadBlocking, loadDecisionLog, userId])

  const stats = useMemo(() => {
    const completedTasks = tasks.filter(t => t.status === 'completed').length
    const activeTasks = tasks.filter(t => t.status === 'active').length
    
    const totalPoints = objectives.reduce((sum, obj) => sum + (obj.level || 0), 0)
    
    const totalSessions = blockingState.history.length
    const totalFocusMinutes = blockingState.history.reduce((sum, s) => {
      const durationMs = new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()
      return sum + (durationMs / 60000)
    }, 0)
    const focusHours = Math.floor(totalFocusMinutes / 60)
    const focusRemainingMins = totalFocusMinutes % 60

    return {
      completedTasks,
      activeTasks,
      totalObjectives: objectives.length,
      totalPoints,
      totalSessions,
      focusHours,
      focusRemainingMins
    }
  }, [tasks, objectives, blockingState.history])

  const loaded = tasksLoaded && levelsLoaded && blockingLoaded && decisionLogLoaded

  if (!loaded) {
    return (
      <PageTransition>
        <PageSkeleton>
          <div className="space-y-2">
            <div className="h-8 w-48 animate-pulse rounded bg-bg-card" />
            <div className="h-3 w-72 animate-pulse rounded bg-bg-card" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </PageSkeleton>
      </PageTransition>
    )
  }

  return (
    <PageTransition>
      <div className="flex h-full flex-col gap-8 overflow-y-auto px-12 pb-16 pt-16">
        <header className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Statistiques</h1>
            <p className="mt-2 max-w-2xl text-sm text-text-secondary">
              Analysez votre productivité, votre temps de focus et vos accomplissements sur Vethos.
            </p>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <StatCard
            icon={Clock}
            label="Temps de Focus Total"
            value={`${stats.focusHours}h ${stats.focusRemainingMins}m`}
            subValue={`${stats.totalSessions} sessions au total`}
            color="text-accent"
            bg="bg-accent/10"
            border="border-accent/20"
          />
          <StatCard
            icon={CheckCircle2}
            label="Tâches Complétées"
            value={stats.completedTasks.toString()}
            subValue={`${stats.activeTasks} tâches encore actives`}
            color="text-emerald-400"
            bg="bg-emerald-500/10"
            border="border-emerald-500/20"
          />
          <StatCard
            icon={Award}
            label="Points d'Objectifs"
            value={stats.totalPoints.toString()}
            subValue={`Répartis sur ${stats.totalObjectives} objectifs`}
            color="text-yellow"
            bg="bg-yellow/10"
            border="border-yellow/20"
          />
        </div>

        <DecisionTimeline entries={decisionEntries} />
      </div>
    </PageTransition>
  )
}

function decisionSummary(entry: DecisionLogEntry): string {
  if (entry.placementResult) return entry.placementResult.reasons[0] ?? `Placement ${entry.placementResult.placementQuality}`
  if (entry.priorityResult) return entry.priorityResult.humanReasons[0] ?? `Priorité ${entry.priorityResult.priorityScore}/100`
  if (entry.sessionPlan) return entry.sessionPlan.reasons[0] ?? 'Plan de session appliqué.'
  if (entry.protectionResult) return entry.protectionResult.applied ? 'Protection appliquée.' : entry.protectionResult.warnings[0] ?? 'Protection partielle.'
  if (entry.learningUpdate) return entry.learningUpdate.reasons[0] ?? 'Signal d’apprentissage enregistré.'
  return entry.explanation?.humanReasons[0] ?? 'Décision enregistrée.'
}

function DecisionTimeline({ entries }: { entries: DecisionLogEntry[] }): JSX.Element {
  const recent = [...entries].reverse().slice(0, 30)
  return (
    <section className="info-panel rounded-2xl bg-bg-elevated/40 p-6">
      <div className="flex items-center gap-3"><Activity size={20} className="text-accent" /><div><h3 className="font-semibold text-text-primary">Journal des décisions</h3><p className="text-xs text-text-muted">Pourquoi Vethos a priorisé, placé, protégé ou appris.</p></div></div>
      {recent.length === 0 ? <p className="mt-6 text-sm text-text-muted">Aucune décision enregistrée pour le moment.</p> : <ol className="mt-5 space-y-3">
        {recent.map((entry) => <li key={entry.id} className="rounded-xl border border-border-subtle bg-bg-base/50 p-4">
          <div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">{entry.type.replaceAll('_', ' ')}</span><time className="text-[10px] text-text-muted">{new Date(entry.createdAt).toLocaleString('fr-CA')}</time></div>
          <p className="mt-2 text-sm text-text-primary">{decisionSummary(entry)}</p>
          {entry.targetId && <p className="mt-1 truncate text-[10px] text-text-muted">Cible : {entry.targetId}</p>}
        </li>)}
      </ol>}
    </section>
  )
}

function StatCard({ 
  icon: Icon, 
  label, 
  value, 
  subValue, 
  color, 
  bg, 
  border 
}: { 
  icon: React.ElementType, 
  label: string, 
  value: string, 
  subValue: string, 
  color: string, 
  bg: string, 
  border: string 
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="info-panel flex flex-col gap-3 rounded-2xl bg-bg-elevated p-6 border border-border-subtle"
    >
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${bg} ${border} border`}>
          <Icon size={20} className={color} />
        </div>
        <div className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          {label}
        </div>
      </div>
      <div>
        <div className="text-3xl font-bold tracking-tight text-text-primary tabular-nums">
          {value}
        </div>
        <div className="mt-1 text-xs text-text-secondary">
          {subValue}
        </div>
      </div>
    </motion.div>
  )
}
