import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, CheckCircle2, Clock, Check, X, Trash2 } from 'lucide-react'
import { PageTransition } from '@/components/PageTransition'
import { PageSkeleton, SkeletonCard } from '@/components/ui/Skeleton'
import { useTasksStore } from '@/store/tasks.store'
import { useLevelsStore } from '@/store/levels.store'
import { daysUntilLevelChange, getDeadlineMultiplier } from '@/lib/free-time-calculator'
import type { Objective, Task } from '@shared/schemas'
import { cn } from '@/lib/cn'

type TaskDraft = {
  id?: string
  title: string
  deadline: string
  level: number
  linkedObjectiveId: string | null
}

export default function TasksPage() {
  const { loaded, tasks, load, saveTask, deleteTask, markTaskCompleted } = useTasksStore()
  const objectives = useLevelsStore((s) => s.objectives)
  const loadLevels = useLevelsStore((s) => s.load)
  const levelsLoaded = useLevelsStore((s) => s.loaded)

  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<Task | null>(null)

  useEffect(() => {
    void load()
    if (!levelsLoaded) void loadLevels()
  }, [load, loadLevels, levelsLoaded])

  const activeTasks = useMemo(
    () =>
      tasks
        .filter((t) => t.status === 'active')
        .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime()),
    [tasks],
  )
  const completedTasks = useMemo(
    () =>
      tasks
        .filter((t) => t.status === 'history')
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
            <h1 className="text-3xl font-semibold tracking-tight">Mes tâches</h1>
            <p className="mt-2 max-w-2xl text-sm text-text-secondary">
              {
                "Ajoute tes devoirs et petites tâches ponctuelles. L'urgence et le niveau détermineront l'attention que Nexus leur accorde."
              }
            </p>
          </div>
          <button
            type="button"
            onClick={() => openEditor(null)}
            className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          >
            <Plus size={16} />
            Nouvelle tâche
          </button>
        </header>

        <section>
          <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-text-muted">
            Tâches actives ({activeTasks.length})
          </h2>
          {activeTasks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border-subtle p-12 text-center">
              <div className="text-sm text-text-secondary">Aucune tâche en cours.</div>
              <button
                type="button"
                onClick={() => openEditor(null)}
                className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
              >
                <Plus size={14} strokeWidth={2.5} />
                Ajouter une tâche
              </button>
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

        {completedTasks.length > 0 && (
          <section>
            <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-text-muted">
              Historique récent
            </h2>
            <div className="flex flex-col gap-2">
              {completedTasks.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between rounded-lg border border-border-subtle bg-bg-card px-4 py-3 opacity-60 grayscale transition-opacity hover:opacity-100 hover:grayscale-0"
                >
                  <div className="text-sm font-medium line-through text-text-muted">{t.title}</div>
                  <CheckCircle2 size={16} className="text-emerald-500" />
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

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
  const obj = objectives.find((o) => o.id === task.linkedObjectiveId)
  const today = new Date().toISOString().split('T')[0] || ''
  const diffDays = Math.ceil(
    (new Date(task.deadline).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24),
  )
  const multiplier = getDeadlineMultiplier(task.deadline, today)
  const cooldownDays = daysUntilLevelChange(task.lastLevelChangeAt)

  let dlLabel = `${diffDays} jours`
  if (diffDays <= 0) dlLabel = 'En retard'
  else if (diffDays === 1) dlLabel = 'Demain'

  return (
    <div className="group relative flex flex-col gap-4 rounded-xl border border-border-subtle bg-bg-elevated p-5 shadow-card transition-colors hover:border-border-strong">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 cursor-pointer" onClick={onEdit}>
          <h3 className="truncate text-base font-semibold text-text-primary">{task.title}</h3>
          <div className="mt-1 flex items-center gap-2 text-xs">
            {obj ? (
              <span className="flex items-center gap-1 text-text-secondary">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: obj.color }} />
                {obj.name}
              </span>
            ) : (
              <span className="text-text-muted">Aucun objectif lié</span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onComplete()
          }}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border-subtle text-text-muted hover:border-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-500 transition-colors"
        >
          <Check size={16} />
        </button>
      </div>

      <div className="flex items-center gap-4 border-t border-border-subtle pt-4">
        <div className="flex flex-1 items-center gap-3">
          <div className="text-[10px] uppercase tracking-widest text-text-muted">Niveau</div>
          <div className="flex flex-1 items-center gap-2">
            <div className="h-1.5 w-full rounded-full bg-bg-base overflow-hidden">
              <div
                className={cn(
                  'h-full',
                  task.level >= 6 ? 'bg-red-500' : task.level >= 4 ? 'bg-yellow' : 'bg-emerald-500',
                )}
                style={{ width: `${(task.level / 10) * 100}%` }}
              />
            </div>
            <span className="text-xs font-bold text-text-primary tabular-nums">{task.level}</span>
          </div>
        </div>
        <div
          className="flex items-center gap-1.5 rounded-md bg-bg-base px-2.5 py-1 text-xs font-medium"
          style={{
            color: multiplier >= 2.0 ? '#ef4444' : multiplier >= 1.6 ? '#FF8A00' : '#8E9BAE',
          }}
        >
          <Clock size={12} />
          {dlLabel}
        </div>
      </div>
      {cooldownDays > 0 && (
        <div className="rounded-md border border-orange/30 bg-orange/10 px-3 py-2 text-[10px] font-medium text-orange">
          Impossible de redescendre avant {cooldownDays} jour{cooldownDays > 1 ? 's' : ''}.
        </div>
      )}
    </div>
  )
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
  const [level, setLevel] = useState(5)
  const [linkedObjectiveId, setLinkedObjectiveId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    if (initial) {
      setTitle(initial.title)
      setDeadline(initial.deadline || '')
      setLevel(initial.level)
      setLinkedObjectiveId(initial.linkedObjectiveId)
    } else {
      setTitle('')
      setDeadline(new Date().toISOString().split('T')[0] || '')
      setLevel(5)
      setLinkedObjectiveId(null)
    }
  }, [open, initial])

  const canSave = title.trim().length > 0 && deadline.trim().length > 0 && !busy

  const handleSave = async () => {
    setBusy(true)
    try {
      await onSave({
        id: initial?.id,
        title: title.trim(),
        deadline,
        level,
        linkedObjectiveId,
      })
      onClose()
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
              <button
                type="button"
                onClick={onClose}
                className="rounded-md p-1.5 text-text-muted hover:bg-bg-card hover:text-text-primary"
              >
                <X size={18} />
              </button>
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
                  min="0"
                  max="10"
                  step="1"
                  value={level}
                  onChange={(e) => setLevel(parseInt(e.target.value))}
                  className="w-full accent-accent h-1.5 rounded-full bg-bg-base appearance-none cursor-pointer"
                />
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
            </div>
            <footer className="flex items-center justify-between border-t border-border-subtle px-6 py-4">
              {initial ? (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 size={14} /> Supprimer
                </button>
              ) : (
                <div />
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md px-4 py-2 text-sm text-text-secondary hover:bg-bg-card"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!canSave}
                  className={cn(
                    'rounded-md px-4 py-2 text-sm font-medium transition-colors',
                    canSave
                      ? 'bg-accent text-white hover:bg-accent-hover'
                      : 'bg-bg-card text-text-muted cursor-not-allowed',
                  )}
                >
                  {busy ? 'Sauvegarde...' : 'Sauvegarder'}
                </button>
              </div>
            </footer>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
