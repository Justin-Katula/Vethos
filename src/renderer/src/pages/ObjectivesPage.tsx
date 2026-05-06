import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, Target } from 'lucide-react'
import { PageTransition } from '@/components/PageTransition'
import { ObjectiveCard } from '@/components/levels/ObjectiveCard'
import { ObjectiveEditor } from '@/components/levels/ObjectiveEditor'
import { PageSkeleton, SkeletonCard } from '@/components/ui/Skeleton'
import { useLevelsStore } from '@/store/levels.store'
import { useScheduleStore } from '@/store/schedule.store'
import { useBlockingStore } from '@/store/blocking.store'
import type { Objective } from '@shared/schemas'

export default function ObjectivesPage(): JSX.Element {
  const {
    loaded,
    objectives,
    load,
    saveObjective,
    deleteObjective,
    reconcileWithHistory,
  } = useLevelsStore()
  const rules = useScheduleStore((s) => s.rules)
  const loadSchedule = useScheduleStore((s) => s.load)
  const scheduleLoaded = useScheduleStore((s) => s.loaded)
  const blockingState = useBlockingStore((s) => s.state)
  const loadBlocking = useBlockingStore((s) => s.load)
  const blockingLoaded = useBlockingStore((s) => s.loaded)

  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<Objective | null>(null)

  useEffect(() => {
    void load()
    if (!scheduleLoaded) void loadSchedule()
    if (!blockingLoaded) void loadBlocking()
  }, [load, loadSchedule, loadBlocking, scheduleLoaded, blockingLoaded])

  // Réconcilie quand l'historique change
  useEffect(() => {
    if (!loaded || !blockingLoaded) return
    void reconcileWithHistory(blockingState.history, rules)
  }, [loaded, blockingLoaded, blockingState.history, rules, reconcileWithHistory])

  const sorted = useMemo(
    () =>
      [...objectives].sort((a, b) => {
        if (b.xpMinutes !== a.xpMinutes) return b.xpMinutes - a.xpMinutes
        return a.createdAt.localeCompare(b.createdAt)
      }),
    [objectives],
  )

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
              {"Le travail concentré te fait monter en niveau. Chaque session terminée crédite tes objectifs liés et alimente ta banque de temps libre."}
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
              transition={{ duration: 0.4 }}
              className="flex max-w-md flex-col items-center gap-4 rounded-2xl border border-dashed border-border-subtle bg-bg-elevated/40 p-10 text-center"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/10 text-accent">
                <Target size={28} />
              </div>
              <div>
                <h3 className="text-lg font-semibold tracking-tight">
                  {"Crée ton premier objectif"}
                </h3>
                <p className="mt-2 text-sm text-text-muted">
                  {"Donne un sens à tes sessions de focus. Lie une couleur à un projet qui te tient à cœur — chaque minute concentrée le fera grandir."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => openEditor(null)}
                className="mt-2 inline-flex items-center gap-2 rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
              >
                <Plus size={16} />
                {"Créer mon premier objectif"}
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
                  history={blockingState.history}
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
        rules={rules}
        onClose={() => setEditorOpen(false)}
        onSave={saveObjective}
        onDelete={deleteObjective}
      />
    </PageTransition>
  )
}
