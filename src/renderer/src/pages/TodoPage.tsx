import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ObjectiveCard } from '@/components/levels/ObjectiveCard'
import { ObjectiveEditor } from '@/components/levels/ObjectiveEditor'
import { useBlockingStore } from '@/store/blocking.store'
import { useScheduleStore } from '@/store/schedule.store'

function daysBetweenLocalDates(fromDateStr: string, toDateStr: string): number {
  const [fromYear, fromMonth, fromDay] = fromDateStr.split('-').map(Number) as [number, number, number]
  const [toYear, toMonth, toDay] = toDateStr.split('-').map(Number) as [number, number, number]
  const from = new Date(fromYear, fromMonth - 1, fromDay)
  const to = new Date(toYear, toMonth - 1, toDay)
  return Math.round((to.getTime() - from.getTime()) / 86_400_000)
}
import {
  Plus,
  CheckCircle2,
  Clock,
  Check,
  X,
  Trash2,
  Shield,
  ShieldCheck,
  Snowflake,
} from 'lucide-react'
import { PageTransition } from '@/components/PageTransition'
import { Button } from '@/components/ui/Button'
import { PageSkeleton, SkeletonCard } from '@/components/ui/Skeleton'
import { WorkBlockingFields } from '@/components/blocking/WorkBlockingFields'
import { useTasksStore } from '@/store/tasks.store'
import { useLevelsStore } from '@/store/levels.store'
import { useRegistryStore } from '@/store/registry.store'
import { useSettingsStore } from '@/store/settings.store'
import { useUserModelStore } from '@/store/user-model.store'
import { getEngineFlags, withV1FallbackSync } from '@/lib/engine-activation'
import { sortTasksV2 } from '@/lib/placement-v2-adapter'
import { buildObjectiveModelV2 } from '@/lib/objective-model-builder'
import { buildTaskStatus } from '@/lib/task-intelligence'
import { momentumPhrase, priorityPhrase, stagnationPhrase, urgencyPhrase, workloadPhrase } from '@/lib/human-score-language'
import { buildObjectivePriorityResult, buildTaskPriorityResult, selectPrimaryObjectiveId } from '@/lib/priority-engine'
import { useDecisionLogStore } from '@/store/decision-log.store'
import {
  daysUntilLevelChange,
  estimateMinutesForLevel,
  getDeadlineMultiplier,
  taskDeadlineLabel,
} from '@/lib/free-time-calculator'
import { resolveWorkBlockingForTask } from '@/lib/work-blocking'
import type { Objective, Task, WorkBlockingConfig, UnlockPolicy } from '@shared/schemas'
import { cn } from '@/lib/cn'

type TaskDraft = {
  id?: string
  title: string
  deadline: string
  deadlineTime?: string
  deadlineImpact?: Task['deadlineImpact']
  complexity?: Task['complexity']
  level: number
  linkedObjectiveId: string | null
  blocking?: WorkBlockingConfig
  unlockPolicy?: UnlockPolicy
  scheduledDurationMinutes?: number
  devForceDate?: string
  devForceStartMinute?: number
  devForceEndMinute?: number
}

export default function TodoPage() {
  const { loaded, tasks, load, saveTask, deleteTask, markTaskCompleted } = useTasksStore()
  const tasksUserId = useTasksStore((s) => s.userId)
  const persistTaskPriorityScores = useTasksStore((s) => s.persistPriorityScores)
  const objectives = useLevelsStore((s) => s.objectives)
  const loadLevels = useLevelsStore((s) => s.load)
  const levelsLoaded = useLevelsStore((s) => s.loaded)
  const persistObjectivePriorityScores = useLevelsStore((s) => s.persistPriorityScores)

  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<Task | null>(null)
  
  const rules = useScheduleStore((s) => s.rules)
  const loadSchedule = useScheduleStore((s) => s.load)
  const scheduleLoaded = useScheduleStore((s) => s.loaded)
  const blockingState = useBlockingStore((s) => s.state)
  const loadBlocking = useBlockingStore((s) => s.load)
  const blockingLoaded = useBlockingStore((s) => s.loaded)
  const saveObjective = useLevelsStore((s) => s.saveObjective)
  const deleteObjective = useLevelsStore((s) => s.deleteObjective)
  const [objEditorOpen, setObjEditorOpen] = useState(false)
  const [editingObj, setEditingObj] = useState<Objective | null>(null)

  const engineV2Placement = useSettingsStore((s) => s.engineV2Placement)
  const engineV2Blocking = useSettingsStore((s) => s.engineV2Blocking)
  const engineV2Priority = useSettingsStore((s) => s.engineV2Priority)
  const engineV2Completion = useSettingsStore((s) => s.engineV2Completion)
  const engineV2Execution = useSettingsStore((s) => s.engineV2Execution)
  const registry = useRegistryStore((s) => s.items)
  const userModel = useUserModelStore((s) => s.model)
  const registryLoaded = useRegistryStore((s) => s.loaded)
  const loadRegistry = useRegistryStore((s) => s.load)

  const tasksLoadUserRef = useRef<string | null>(null)
  const levelsLoadUserRef = useRef<string | null>(null)
  const scheduleLoadUserRef = useRef<string | null>(null)
  const blockingLoadUserRef = useRef<string | null>(null)
  const registryLoadUserRef = useRef<string | null>(null)

  useEffect(() => {
    if (!tasksUserId) return
    if (!loaded && tasksLoadUserRef.current !== tasksUserId) {
      tasksLoadUserRef.current = tasksUserId
      void load(tasksUserId).finally(() => {
        if (tasksLoadUserRef.current === tasksUserId) tasksLoadUserRef.current = null
      })
    }
    if (!levelsLoaded && levelsLoadUserRef.current !== tasksUserId) {
      levelsLoadUserRef.current = tasksUserId
      void loadLevels(tasksUserId).finally(() => {
        if (levelsLoadUserRef.current === tasksUserId) levelsLoadUserRef.current = null
      })
    }
    if (!scheduleLoaded && scheduleLoadUserRef.current !== tasksUserId) {
      scheduleLoadUserRef.current = tasksUserId
      void loadSchedule(tasksUserId).finally(() => {
        if (scheduleLoadUserRef.current === tasksUserId) scheduleLoadUserRef.current = null
      })
    }
    if (!blockingLoaded && blockingLoadUserRef.current !== tasksUserId) {
      blockingLoadUserRef.current = tasksUserId
      void loadBlocking(tasksUserId).finally(() => {
        if (blockingLoadUserRef.current === tasksUserId) blockingLoadUserRef.current = null
      })
    }
    if (!registryLoaded && registryLoadUserRef.current !== tasksUserId) {
      registryLoadUserRef.current = tasksUserId
      void loadRegistry(tasksUserId).finally(() => {
        if (registryLoadUserRef.current === tasksUserId) registryLoadUserRef.current = null
      })
    }
  }, [
    load,
    loadLevels,
    loadSchedule,
    loadBlocking,
    loadRegistry,
    loaded,
    levelsLoaded,
    scheduleLoaded,
    blockingLoaded,
    registryLoaded,
    tasksUserId,
  ])

  const sortedObjectives = useMemo(
    () =>
      [...objectives].sort((a, b) => {
        if (b.level !== a.level) return b.level - a.level
        return a.createdAt.localeCompare(b.createdAt)
      }),
    [objectives],
  )

  const objectiveModels = useMemo(() => new Map(sortedObjectives.map((objective) => {
    const linkedProfileIds = new Set(rules.filter((rule) => objective.linkedRuleIds.includes(rule.id)).map((rule) => rule.linkedProfileId).filter(Boolean))
    const sessions = blockingState.history.filter((entry) => linkedProfileIds.has(entry.profileId)).map((entry) => ({
      targetType: 'objective' as const,
      targetId: objective.id,
      objectiveId: objective.id,
      startedAt: entry.startedAt,
      endedAt: entry.endedAt,
      durationMinutes: Math.max(0, Math.round((Date.parse(entry.endedAt) - Date.parse(entry.startedAt)) / 60_000)),
      status: entry.completedNormally ? 'completed' : 'aborted',
    }))
    const model = buildObjectiveModelV2({
      objective,
      linkedTasks: tasks.filter((task) => task.linkedObjectiveId === objective.id),
      sessions,
      behaviorEvents: userModel?.behaviorEvents,
      userModel,
      registry,
      now: new Date(),
    })
    return [objective.id, model] as const
  })), [sortedObjectives, tasks, userModel, registry, rules, blockingState.history])

  const recordDecision = useDecisionLogStore((state) => state.record)
  useEffect(() => {
    if (!tasksUserId || !loaded || !levelsLoaded) return
    const primaryObjectiveId = selectPrimaryObjectiveId(objectives, userModel)
    const events = userModel?.behaviorEvents ?? []
    const context = {
      primaryObjectiveId,
      recentlyWorkedTargetIds: events.filter((event) => ['task_started','session_started','session_completed'].includes(event.type)).flatMap((event) => [event.targetId,event.context?.taskId,event.context?.objectiveId].filter(Boolean) as string[]),
      recentlyCompletedTaskIds: events.filter((event) => event.type === 'task_completed').flatMap((event) => [event.targetId,event.context?.taskId].filter(Boolean) as string[]),
      recentlyIgnoredTargetIds: events.filter((event) => ['task_skipped','recommendation_rejected'].includes(event.type)).map((event) => event.targetId).filter(Boolean) as string[],
    }
    const taskResults: ReturnType<typeof buildTaskPriorityResult>[] = []
    for (const task of tasks.filter((item) => item.status === 'active')) {
      const objective = objectives.find((item) => item.id === task.linkedObjectiveId) ?? null
      const priorityResult = buildTaskPriorityResult(task, objective, context)
      taskResults.push(priorityResult)
      void recordDecision({ type: 'task_priority', targetType: 'task', targetId: task.id, priorityResult })
    }
    const objectiveResults: ReturnType<typeof buildObjectivePriorityResult>[] = []
    for (const objective of objectives.filter((item) => item.status === 'active')) {
      const priorityResult = buildObjectivePriorityResult(objective, tasks.filter((task) => task.linkedObjectiveId === objective.id), context)
      objectiveResults.push(priorityResult)
      void recordDecision({ type: 'objective_priority', targetType: 'objective', targetId: objective.id, priorityResult })
    }
    void persistTaskPriorityScores(taskResults)
    void persistObjectivePriorityScores(objectiveResults)
  }, [loaded, levelsLoaded, objectives, recordDecision, tasks, tasksUserId, userModel, persistTaskPriorityScores, persistObjectivePriorityScores])
  
  const urgencyByObjectiveId = useMemo(() => {
    const today = todayDateStr()
    const map = new Map<string, 'warning' | 'critical'>()
    for (const task of tasks) {
      if (task.status !== 'active' || !task.linkedObjectiveId) continue
      const daysLeft = daysBetweenLocalDates(today, task.deadline)
      const urgency = daysLeft <= 1 ? 'critical' : daysLeft <= 3 ? 'warning' : null
      if (!urgency) continue
      const previous = map.get(task.linkedObjectiveId)
      if (!previous || urgency === 'critical') map.set(task.linkedObjectiveId, urgency)
    }
    return map
  }, [tasks])

  const openObjEditor = (obj: Objective | null): void => {
    setEditingObj(obj)
    setObjEditorOpen(true)
  }

  const activeTasks = useMemo(() => {
    const flags = getEngineFlags({
      engineV2Placement,
      engineV2Blocking,
      engineV2Priority,
      engineV2Completion,
      engineV2Execution,
    })

    const activeList = tasks.filter((t) => t.status === 'active')

    if (flags.newPriorityControlsSorting) {
      return withV1FallbackSync({
        v2: () => {
          return sortTasksV2(activeList, objectives, registry, { userModel }, new Date())
        },
        v1: () => {
          return [...activeList].sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime())
        },
        label: 'sort-tasks-v2',
      })
    } else {
      return [...activeList].sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime())
    }
  }, [
    tasks,
    objectives,
    registry,
    userModel,
    engineV2Placement,
    engineV2Blocking,
    engineV2Priority,
    engineV2Completion,
    engineV2Execution,
  ])
  const completedTasks = useMemo(
    () =>
      tasks
        .filter((t) => t.status === 'completed')
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 10),
    [tasks],
  )
  const queuedTasks = useMemo(
    () =>
      tasks
        .filter((t) => t.status === 'queued')
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [tasks],
  )
  const expiredTasks = useMemo(
    () =>
      tasks
        .filter((t) => t.status === 'expired')
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 10),
    [tasks],
  )

  const openEditor = (task: Task | null) => {
    setEditing(task)
    setEditorOpen(true)
  }

  if (!loaded) {
    return (
      <PageTransition>
        <PageSkeleton>
          <div className="space-y-2">
            <div className="h-8 w-40 animate-pulse rounded bg-bg-card" />
            <div className="h-3 w-60 animate-pulse rounded bg-bg-card" />
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
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
        <header className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">À faire</h1>
            <p className="mt-2 max-w-2xl text-sm text-text-secondary">
              Gérez vos objectifs à long terme et vos tâches quotidiennes. Parlez au Coach pour planifier rapidement !
            </p>
          </div>
          <Button variant="solid" type="button" onClick={() => openEditor(null)}>
            <Plus size={16} />
            Tâche
          </Button>
        </header>

        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-medium uppercase tracking-wider text-text-muted">
              Mes Objectifs ({sortedObjectives.length})
            </h2>
            <Button variant="solid" type="button" onClick={() => openObjEditor(null)} size="sm">
              <Plus size={14} /> Objectif
            </Button>
          </div>
          {sortedObjectives.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {sortedObjectives.map((obj) => (
                <ObjectiveCard
                  key={obj.id}
                  objective={obj}
                  model={objectiveModels.get(obj.id)}
                  rules={rules}
                  history={blockingState.history}
                  urgency={urgencyByObjectiveId.get(obj.id)}
                  onClick={() => openObjEditor(obj)}
                />
              ))}
            </div>
          ) : (
            <div className="info-panel rounded-xl border-dashed p-6 text-center text-sm text-text-secondary">
              Aucun objectif en cours. Le Coach peut vous aider à en créer un.
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-text-muted">
            Tâches actives ({activeTasks.length})
          </h2>
          {activeTasks.length === 0 ? (
            <div className="info-panel rounded-xl border-dashed p-12 text-center">
              <div className="text-sm text-text-secondary">Aucune tâche en cours.</div>
              <Button
                variant="solid"
                type="button"
                onClick={() => openEditor(null)}
                className="mt-4"
              >
                <Plus size={14} strokeWidth={2.5} />
                Ajouter une tâche
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {activeTasks.map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  objectives={objectives}
                  onEdit={() => openEditor(t)}
                  onComplete={() => markTaskCompleted(t.id)}
                />
              ))}
            </div>
          )}
        </section>

        {queuedTasks.length > 0 && (
          <section>
            <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-sky-200/80">
              File cryogénisée ({queuedTasks.length})
            </h2>
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {queuedTasks.map((task) => (
                <div
                  key={task.id}
                  className="info-panel relative rounded-xl border-sky-300/20 bg-sky-950/25 p-4 text-sky-50 opacity-75 saturate-50 backdrop-blur"
                >
                  <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(186,230,253,0.16),transparent_35%,rgba(56,189,248,0.08))]" />
                  <div className="relative flex items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <Snowflake size={14} />
                        <span>{task.title}</span>
                      </div>
                      <div className="mt-1 text-xs text-sky-100/70">
                        Delta gelé:{' '}
                        {task.frozenDeadlineOffsetMinutes !== undefined
                          ? `${Math.floor(task.frozenDeadlineOffsetMinutes / 1440)}j ${Math.floor((task.frozenDeadlineOffsetMinutes % 1440) / 60)}h`
                          : `${task.frozenDeadlineOffsetDays ?? 0}j`}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditor(task)}
                    >
                      Modifier
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {completedTasks.length > 0 && (
          <section>
            <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-text-muted">
              Complétées récemment
            </h2>
            <div className="flex flex-col gap-2">
              {completedTasks.map((t) => (
                <div
                  key={t.id}
                  className="info-panel flex items-center justify-between rounded-lg px-4 py-3 opacity-60 grayscale transition-opacity hover:opacity-100 hover:grayscale-0"
                >
                  <div className="text-sm font-medium line-through text-text-muted">{t.title}</div>
                  <CheckCircle2 size={16} className="text-emerald-500" />
                </div>
              ))}
            </div>
          </section>
        )}

        {expiredTasks.length > 0 && (
          <section>
            <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-text-muted">
              Expirées
            </h2>
            <div className="flex flex-col gap-2">
              {expiredTasks.map((t) => (
                <div
                  key={t.id}
                  className="info-panel flex items-center justify-between rounded-lg border-red-500/20 bg-red-500/5 px-4 py-3"
                >
                  <div className="text-sm font-medium text-red-100">{t.title}</div>
                  <span className="text-xs text-red-300">
                    {taskDeadlineLabel(t, todayDateStr())}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <ObjectiveEditor
        open={objEditorOpen}
        initial={editingObj}
        existingObjectives={objectives}
        rules={rules}
        onClose={() => setObjEditorOpen(false)}
        onSave={saveObjective}
        onDelete={deleteObjective}
      />

      <TaskEditor
        open={editorOpen}
        initial={editing}
        objectives={objectives}
        onClose={() => setEditorOpen(false)}
        onSave={saveTask}
        onDelete={deleteTask}
      />
    </PageTransition>
  )
}

function TaskCard({
  task,
  objectives,
  onEdit,
  onComplete,
}: {
  task: Task
  objectives: Objective[]
  onEdit: () => void
  onComplete: () => void
}) {
  const [showWhy, setShowWhy] = useState(false)
  const obj = objectives.find((o) => o.id === task.linkedObjectiveId)
  const blocking = resolveWorkBlockingForTask(task, obj)
  const today = todayDateStr()
  const multiplier =
    task.deadline === today && task.deadlineTime ? 2 : getDeadlineMultiplier(task.deadline, today)
  const cooldownDays = daysUntilLevelChange(task.lastLevelChangeAt)
  const dlLabel = taskDeadlineLabel(task, today)
  const estimate = task.estimatedMinutes ?? estimateMinutesForLevel(task.level)
  const remaining = task.remainingMinutes ?? estimate
  const intelligence = buildTaskStatus(task, obj)
  const score = task.priorityScoreV2

  return (
    <div className="info-panel group flex flex-col justify-between gap-4 rounded-xl bg-bg-elevated p-5 transition-all duration-300 hover:-translate-y-0.5 will-change-transform">
      {/* Top indicator color strip */}
      {obj && (
        <div
          className="absolute left-0 right-0 top-0 h-1 transition-all group-hover:h-1.5"
          style={{ backgroundColor: obj.color }}
        />
      )}

      <div className="relative flex flex-col space-y-4 w-full">
        {/* Header Row */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1 cursor-pointer" onClick={onEdit}>
            <h3 className="font-semibold text-text-primary tracking-tight text-[15px] leading-snug group-hover:text-accent transition-colors">
              {task.title}
            </h3>
            <div className="mt-1.5 flex items-center gap-2">
              {obj ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary bg-white/5 border border-border-subtle/50 px-2 py-0.5 rounded-lg">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: obj.color }} />
                  {obj.name}
                </span>
              ) : (
                <span className="text-xs text-text-muted">Aucun objectif lié</span>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onComplete()
            }}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl hover:border-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-500 hover:scale-105"
            title="Marquer comme complété"
          >
            <Check size={14} strokeWidth={2.5} />
          </Button>
        </div>

        {/* Blocking status tag if any */}
        {blocking && (
          <div className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-white/5 border border-border-subtle/50 px-2.5 py-0.5 text-[10px] font-medium text-text-secondary">
            {blocking.mode === 'allowlist' ? (
              <ShieldCheck size={11} className="text-emerald-400" />
            ) : (
              <Shield size={11} className="text-accent" />
            )}
            {blocking.mode === 'allowlist' ? 'Focus strict' : 'Filtre actif'}
          </div>
        )}

        {/* Remaining & Estimate Grid */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-lg bg-white/5 border border-border-subtle/50 px-3 py-2">
            <div className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
              Restant
            </div>
            <div className="mt-1 text-sm font-semibold text-text-primary tabular-nums">
              {remaining} min
            </div>
          </div>
          <div className="rounded-lg bg-white/5 border border-border-subtle/50 px-3 py-2">
            <div className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
              Estimation
            </div>
            <div className="mt-1 text-sm font-semibold text-text-secondary tabular-nums">
              {estimate} min
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-1.5 text-[10px] text-text-secondary sm:grid-cols-2">
          <span><strong className="text-text-primary">{priorityPhrase(score?.priorityScore ?? task.level * 10)}</strong></span>
          <span>{urgencyPhrase(score?.urgencyScore ?? 0)}</span>
          <span>{workloadPhrase(score?.workloadScore ?? 0)}</span>
          <span>{stagnationPhrase(score?.stagnationScore ?? 0)}</span>
          <span>{momentumPhrase(score?.momentumScore ?? 0)}</span>
          <span>Session conseillée : <strong className="text-text-primary">{intelligence.recommendedSessionLength} min</strong></span>
        </div>

        <button type="button" className="w-fit text-[10px] font-medium text-accent hover:underline" onClick={() => setShowWhy((value) => !value)}>
          Pourquoi ?
        </button>
        {showWhy && (
          <div className="rounded-lg border border-border-subtle/50 bg-bg-base/50 p-3 text-[11px] leading-relaxed text-text-secondary">
            {(score?.reasons.length ? score.reasons : intelligence.reasons).map((reason) => <p key={reason}>• {reason}</p>)}
          </div>
        )}

        {intelligence.requiresMandatoryBreak && (
          <div className="rounded-lg border border-sky-400/20 bg-sky-400/5 px-3 py-2 text-[10px] text-sky-100">
            Pause obligatoire : {intelligence.mandatoryBreaks.map((item) => `${item.durationMinutes} min après ${item.afterMinutes} min`).join(' · ')}
          </div>
        )}

        {/* Footer split row */}
        <div className="flex items-center justify-between gap-4 border-t border-border-subtle/40 pt-4">
          <div className="flex items-center gap-2.5">
            <span className="text-[10px] uppercase font-semibold text-text-muted">Niveau</span>
            <div className="h-1.5 w-16 rounded-full bg-bg-base overflow-hidden">
              <div
                className={cn(
                  'h-full transition-all duration-300',
                  task.level >= 6 ? 'bg-red-500' : task.level >= 4 ? 'bg-yellow' : 'bg-emerald-500',
                )}
                style={{ width: `${(task.level / 10) * 100}%` }}
              />
            </div>
            <span className="text-xs font-bold text-text-primary tabular-nums">{task.level}</span>
          </div>

          <div
            className="flex items-center gap-1.5 rounded-lg bg-white/5 border border-border-subtle/50 px-2.5 py-1 text-xs font-semibold"
            style={{
              color:
                multiplier >= 2.0
                  ? '#ef4444'
                  : multiplier >= 1.6
                    ? '#FF8A00'
                    : 'var(--text-secondary)',
              borderColor:
                multiplier >= 2.0
                  ? 'rgba(239, 68, 68, 0.2)'
                  : multiplier >= 1.6
                    ? 'rgba(255, 138, 0, 0.2)'
                    : 'var(--border-subtle)',
            }}
          >
            <Clock size={12} />
            <span>{dlLabel}</span>
          </div>
        </div>

        {cooldownDays > 0 && (
          <div className="rounded-lg border border-orange/20 bg-orange/5 px-3 py-2 text-[10px] font-medium text-orange">
            Impossible de redescendre avant {cooldownDays} jour{cooldownDays > 1 ? 's' : ''}.
          </div>
        )}
      </div>
    </div>
  )
}

function todayDateStr(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseHourToMinute(hourStr: string): number {
  const [h, m] = hourStr.split(':').map(Number) as [number, number]
  return h * 60 + m
}

function parseMinuteToHour(minute: number): string {
  const h = Math.floor(minute / 60)
  const m = minute % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function TaskEditor({
  open,
  initial,
  objectives,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean
  initial: Task | null
  objectives: Objective[]
  onClose: () => void
  onSave: (draft: TaskDraft) => Promise<unknown> | unknown
  onDelete: (id: string) => Promise<unknown> | unknown
}) {
  const [title, setTitle] = useState('')
  const [deadline, setDeadline] = useState('')
  const [useDeadlineTime, setUseDeadlineTime] = useState(false)
  const [deadlineTime, setDeadlineTime] = useState('17:00')
  const [deadlineImpact, setDeadlineImpact] =
    useState<NonNullable<Task['deadlineImpact']>>('recoverable')
  const [complexity, setComplexity] = useState<NonNullable<Task['complexity']>>('normal')
  const [manualMinutes, setManualMinutes] = useState(60)
  const [level, setLevel] = useState(5)
  const [linkedObjectiveId, setLinkedObjectiveId] = useState<string | null>(null)
  const [blocking, setBlocking] = useState<WorkBlockingConfig | undefined>(undefined)
  const [unlockPolicy, setUnlockPolicy] = useState<UnlockPolicy | undefined>(undefined)
  const [useDevForce, setUseDevForce] = useState(false)
  const [devForceDate, setDevForceDate] = useState('')
  const [devForceStartHour, setDevForceStartHour] = useState('09:00')
  const [devForceEndHour, setDevForceEndHour] = useState('10:00')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    if (initial) {
      setTitle(initial.title)
      setDeadline(initial.deadline || '')
      setUseDeadlineTime(Boolean(initial.deadlineTime))
      setDeadlineTime(initial.deadlineTime ?? '17:00')
      setDeadlineImpact(initial.deadlineImpact ?? 'recoverable')
      setComplexity(initial.complexity ?? 'normal')
      setManualMinutes(initial.scheduledDurationMinutes ?? initial.estimatedMinutes ?? 60)
      setLevel(initial.level)
      setLinkedObjectiveId(initial.linkedObjectiveId)
      setBlocking(initial.blocking)
      setUnlockPolicy(initial.unlockPolicy)
      setUseDevForce(Boolean(initial.devForceDate))
      setDevForceDate(initial.devForceDate ?? todayDateStr())
      setDevForceStartHour(
        initial.devForceStartMinute !== undefined
          ? parseMinuteToHour(initial.devForceStartMinute)
          : '09:00'
      )
      setDevForceEndHour(
        initial.devForceEndMinute !== undefined
          ? parseMinuteToHour(initial.devForceEndMinute)
          : '10:00'
      )
    } else {
      setTitle('')
      setDeadline(todayDateStr())
      setUseDeadlineTime(false)
      setDeadlineTime('17:00')
      setDeadlineImpact('recoverable')
      setComplexity('normal')
      setManualMinutes(60)
      setLevel(5)
      setLinkedObjectiveId(null)
      setBlocking(undefined)
      setUnlockPolicy(undefined)
      setUseDevForce(false)
      setDevForceDate(todayDateStr())
      setDevForceStartHour('09:00')
      setDevForceEndHour('10:00')
    }
    setError(null)
  }, [open, initial])

  const canSave = title.trim().length > 0 && deadline.trim().length > 0 && !busy
  const estimatedMinutes = estimateMinutesForLevel(level)

  const handleSave = async () => {
    setBusy(true)
    setError(null)
    try {
      await onSave({
        id: initial?.id,
        title: title.trim(),
        deadline,
        deadlineTime: useDeadlineTime ? deadlineTime : undefined,
        deadlineImpact,
        complexity,
        level: initial ? initial.level : level,
        scheduledDurationMinutes: complexity === 'manual' ? manualMinutes : initial?.scheduledDurationMinutes,
        linkedObjectiveId,
        blocking,
        unlockPolicy,
        devForceDate: useDevForce ? devForceDate : undefined,
        devForceStartMinute: useDevForce ? parseHourToMinute(devForceStartHour) : undefined,
        devForceEndMinute: useDevForce ? parseHourToMinute(devForceEndHour) : undefined,
      })
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async () => {
    if (!initial) return
    setBusy(true)
    try {
      await onDelete(initial.id)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="fixed right-0 top-0 z-50 flex h-full w-[440px] max-w-full flex-col border-l border-border-subtle bg-bg-elevated shadow-elevated"
          >
            <header className="flex items-center justify-between border-b border-border-subtle px-6 py-4">
              <h2 className="text-lg font-semibold tracking-tight">
                {initial ? 'Modifier la tâche' : 'Nouvelle tâche'}
              </h2>
              <Button variant="ghost" size="sm" type="button" onClick={onClose}>
                <X size={18} />
              </Button>
            </header>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              <div>
                <label className="block text-[10px] font-medium uppercase tracking-widest text-text-muted">
                  Titre
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Devoir de maths..."
                  className="mt-2 w-full rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
                  autoFocus
                />
              </div>
              <WorkBlockingFields value={blocking} onChange={setBlocking} subjectLabel="tâche" />
              <div>
                <label className="block text-[10px] font-medium uppercase tracking-widest text-text-muted">
                  Deadline
                </label>
                <input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="mt-2 w-full rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
                />
                <label className="mt-3 flex items-center gap-2 text-xs text-text-secondary">
                  <input
                    type="checkbox"
                    checked={useDeadlineTime}
                    onChange={(e) => setUseDeadlineTime(e.target.checked)}
                    className="h-4 w-4 accent-accent"
                  />
                  Heure exacte de deadline
                </label>
                {useDeadlineTime && (
                  <input
                    type="time"
                    value={deadlineTime}
                    onChange={(e) => setDeadlineTime(e.target.value)}
                    className="mt-2 w-full rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
                  />
                )}
              </div>
              <div>
                <label className="block text-[10px] font-medium uppercase tracking-widest text-text-muted">
                  Impact deadline
                </label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {(['recoverable', 'hard'] as const).map((value) => (
                    <Button
                      key={value}
                      type="button"
                      variant={deadlineImpact === value ? 'solid' : 'default'}
                      size="sm"
                      onClick={() => setDeadlineImpact(value)}
                      className={cn(
                        'w-full rounded-md px-3 py-2',
                        deadlineImpact === value
                          ? 'border-accent/60 bg-accent/15 text-accent hover:bg-accent/20'
                          : 'bg-bg-base',
                      )}
                    >
                      {value === 'recoverable' ? 'Rattrapable' : 'Dur'}
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-medium uppercase tracking-widest text-text-muted">
                  Complexité
                </label>
                <select
                  value={complexity}
                  onChange={(e) => setComplexity(e.target.value as NonNullable<Task['complexity']>)}
                  className="mt-2 w-full rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
                >
                  <option value="easy">Facile</option>
                  <option value="normal">Normale</option>
                  <option value="hard">Difficile</option>
                  <option value="manual">Manuel</option>
                  <option value="extreme">Extrême — non recommandé</option>
                  <option value="unknown">Inconnue</option>
                </select>
                {complexity === 'manual' && (
                  <div className="mt-3">
                    <label className="block text-[10px] font-medium uppercase tracking-widest text-text-muted">
                      Durée manuelle
                    </label>
                    <input
                      type="number"
                      min={5}
                      max={100_000}
                      value={manualMinutes}
                      onChange={(e) => setManualMinutes(Math.max(5, Math.round(Number(e.target.value) || 5)))}
                      className="mt-2 w-full rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
                    />
                    <p className="mt-1 text-xs text-text-muted">
                      Coach utilisera cette durée au lieu d'une estimation automatique.
                    </p>
                  </div>
                )}
                {complexity === 'extreme' && (
                  <div className="mt-3 rounded-md border border-orange/40 bg-orange/10 px-3 py-2 text-xs text-orange">
                    Non recommandé : ce niveau prend le plus de temps possible et Vethos devra
                    proposer une recalibration quotidienne.
                  </div>
                )}
              </div>
              <div>
                <label className="block text-[10px] font-medium uppercase tracking-widest text-text-muted mb-2">
                  Niveau (Importance)
                </label>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-2xl font-bold text-text-primary">{level}</span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${level === 5 ? 'bg-accent/20 text-accent' : 'bg-bg-base text-text-muted'}`}
                  >
                    {level === 5 ? 'Recommandé' : 'Manuel'}
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="1"
                  value={level}
                  disabled={Boolean(initial)}
                  onChange={(e) => setLevel(parseInt(e.target.value))}
                  className={cn(
                    'h-1.5 w-full appearance-none rounded-full bg-bg-base accent-accent',
                    initial ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
                  )}
                />
                <div className="mt-3 rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-xs text-text-secondary">
                  Niveau {level} = {estimatedMinutes} minutes estimées au total.
                  {initial ? ' Le niveau initial ne se modifie plus après création.' : ''}
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-medium uppercase tracking-widest text-text-muted">
                  Objectif lié
                </label>
                <select
                  value={linkedObjectiveId ?? ''}
                  onChange={(e) => setLinkedObjectiveId(e.target.value || null)}
                  className="mt-2 w-full rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
                >
                  <option value="">Aucun</option>
                  {objectives.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>
              {import.meta.env.DEV && (
                <div className="rounded-xl border border-dashed border-accent/30 bg-accent/5 p-4 space-y-4">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="devForceCheckbox"
                      checked={useDevForce}
                      onChange={(e) => setUseDevForce(e.target.checked)}
                      className="h-4 w-4 accent-accent rounded"
                    />
                    <label
                      htmlFor="devForceCheckbox"
                      className="text-xs font-semibold text-accent uppercase tracking-wider cursor-pointer select-none"
                    >
                      [Développeur] Forcer le placement
                    </label>
                  </div>

                  {useDevForce && (
                    <div className="space-y-4 pt-2 border-t border-accent/10">
                      <div>
                        <label className="block text-[10px] font-medium uppercase tracking-widest text-text-muted">
                          Date forcée (YYYY-MM-DD)
                        </label>
                        <input
                          type="date"
                          value={devForceDate}
                          onChange={(e) => setDevForceDate(e.target.value)}
                          className="mt-2 w-full rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-medium uppercase tracking-widest text-text-muted">
                            Heure début
                          </label>
                          <input
                            type="time"
                            value={devForceStartHour}
                            onChange={(e) => setDevForceStartHour(e.target.value)}
                            className="mt-2 w-full rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-medium uppercase tracking-widest text-text-muted">
                            Heure fin
                          </label>
                          <input
                            type="time"
                            value={devForceEndHour}
                            onChange={(e) => setDevForceEndHour(e.target.value)}
                            className="mt-2 w-full rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {error && (
                <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  {error}
                </div>
              )}
            </div>
            <footer className="flex items-center justify-between border-t border-border-subtle px-6 py-4">
              {initial ? (
                <Button variant="danger" type="button" onClick={handleDelete} disabled={busy}>
                  <Trash2 size={14} /> Supprimer
                </Button>
              ) : (
                <div />
              )}
              <div className="flex items-center gap-2">
                <Button variant="ghost" type="button" onClick={onClose}>
                  Annuler
                </Button>
                <Button
                  variant="solid"
                  type="button"
                  onClick={handleSave}
                  disabled={!canSave}
                  className={cn(!canSave && 'cursor-not-allowed')}
                >
                  {busy ? 'Sauvegarde...' : 'Sauvegarder'}
                </Button>
              </div>
            </footer>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
