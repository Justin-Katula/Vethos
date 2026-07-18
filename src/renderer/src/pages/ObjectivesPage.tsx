import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, Target } from 'lucide-react'
import { PageTransition } from '@/components/PageTransition'
import { ObjectiveCard } from '@/components/levels/ObjectiveCard'
import { ObjectiveEditor } from '@/components/levels/ObjectiveEditor'
import { PageSkeleton, SkeletonCard } from '@/components/ui/Skeleton'
import { useLevelsStore } from '@/store/levels.store'
import { useScheduleStore } from '@/store/schedule.store'
import { useTasksStore } from '@/store/tasks.store'
import type { Objective } from '@shared/schemas'

function localDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function daysBetweenLocalDates(fromDateStr: string, toDateStr: string): number {
  const [fromYear, fromMonth, fromDay] = fromDateStr.split('-').map(Number) as [
    number,
    number,
    number,
  ]
  const [toYear, toMonth, toDay] = toDateStr.split('-').map(Number) as [number, number, number]
  const from = new Date(fromYear, fromMonth - 1, fromDay)
  const to = new Date(toYear, toMonth - 1, toDay)
  return Math.ceil((to.getTime() - from.getTime()) / 86_400_000)
}

export default function ObjectivesPage(): JSX.Element {
  const { loaded, objectives, load, saveObjective, deleteObjective } = useLevelsStore()
  const rules = useScheduleStore((s) => s.rules)
  const loadSchedule = useScheduleStore((s) => s.load)
  const scheduleLoaded = useScheduleStore((s) => s.loaded)
  const tasks = useTasksStore((s) => s.tasks)
  const loadTasks = useTasksStore((s) => s.load)
  const tasksLoaded = useTasksStore((s) => s.loaded)

  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<Objective | null>(null)

  useEffect(() => {
    void load()
    if (!scheduleLoaded) void loadSchedule()
    if (!tasksLoaded) void loadTasks()
  }, [load, loadSchedule, loadTasks, scheduleLoaded, tasksLoaded])

  const sorted = useMemo(
    () =>
      [...objectives].sort((a, b) => {
        if (b.level !== a.level) return b.level - a.level
        return a.createdAt.localeCompare(b.createdAt)
      }),
    [objectives],
  )
  const urgencyByObjectiveId = useMemo(() => {
    const today = localDateKey(new Date())
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

  const openEditor = (obj: Objective | null): void => {
    setEditing(obj)
    setEditorOpen(true)
  }

  if (!loaded) {
    return (
      <PageTransition>
        <PageSkeleton>
          <div className="space-y-2">
            <div className="h-8 w-48 animate-pulse rounded bg-bg-card" />
            <div className="h-3 w-72 animate-pulse rounded bg-bg-card" />
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
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
      <div className="flex h-full flex-col gap-6 overflow-y-auto px-12 pb-16 pt-16">
        <header className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Mes objectifs</h1>
            <p className="mt-2 max-w-2xl text-sm text-text-secondary">
              {
                'Tes objectifs donnent le cap. Le temps libre quotidien est calculé depuis ton planning, puis réparti vers tes tâches actives.'
              }
            </p>
          </div>
          {sorted.length > 0 && (
            <button
              type="button"
              onClick={() => openEditor(null)}
              className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
            >
              <Plus size={16} />
              Nouvel objectif
            </button>
          )}
        </header>

        {sorted.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="flex max-w-md flex-col items-center gap-4 rounded-2xl border border-dashed border-border-subtle bg-bg-elevated/40 p-10 text-center"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                <Target size={28} />
              </div>
              <div>
                <h3 className="text-lg font-semibold tracking-tight">
                  {'Crée ton premier objectif'}
                </h3>
                <p className="mt-2 text-sm text-text-muted">
                  {
                    'Donne un sens à tes sessions de focus. Lie une couleur à un projet qui te tient à cœur — chaque minute concentrée le fera grandir.'
                  }
                </p>
              </div>
              <button
                type="button"
                onClick={() => openEditor(null)}
                className="mt-2 inline-flex items-center gap-2 rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
              >
                <Plus size={16} />
                {'Créer mon premier objectif'}
              </button>
            </motion.div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sorted.map((obj) => (
              <motion.div
                key={obj.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <ObjectiveCard
                  objective={obj}
                  rules={rules}
                  urgency={urgencyByObjectiveId.get(obj.id)}
                  onClick={() => openEditor(obj)}
                />
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <ObjectiveEditor
        open={editorOpen}
        initial={editing}
        existingObjectives={objectives}
        rules={rules}
        onClose={() => setEditorOpen(false)}
        onSave={saveObjective}
        onDelete={deleteObjective}
      />
    </PageTransition>
  )
}
