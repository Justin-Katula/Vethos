import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Check, Plus, Trash2 } from 'lucide-react'
import { PageTransition } from '@/components/PageTransition'
import { TimeCircle } from '@/components/interface/TimeCircle'
import { Disclosure } from '@/components/ui/Disclosure'
import { Modal } from '@/components/ui/Modal'
import { usePlanning } from '@/lib/use-planning'
import { usePlanningStore } from '@/store/planning.store'
import { useSettingsStore } from '@/store/settings.store'
import { addDays, dateKey, dayOfWeek } from '@/lib/planning/dates'
import { sleepScheduleEntries } from '@shared/sleep'
import { cn } from '@/lib/cn'
import type { PlacedBlock, TaskItem } from '@/lib/planning/types'

const DAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
const MONTHS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]

function hhmm(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
}

function duration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`
}

export default function HomePage() {
  const [now, setNow] = useState(() => new Date())
  const [adding, setAdding] = useState(false)

  // L'aiguille doit avancer : sans cela, le cercle ment dès la minute suivante.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const plan = usePlanning(now)
  const tasks = usePlanningStore((s) => s.tasks)
  const addTask = usePlanningStore((s) => s.addTask)
  const deleteTask = usePlanningStore((s) => s.deleteTask)
  const completeTask = usePlanningStore((s) => s.completeTask)
  const schedule = usePlanningStore((s) => s.schedule)
  const sleepStart = useSettingsStore((s) => s.sleepStart)
  const sleepEnd = useSettingsStore((s) => s.sleepEnd)

  const today = dateKey(now)
  const nowMinute = now.getHours() * 60 + now.getMinutes()
  const dow = dayOfWeek(today)

  const todayEntries = useMemo(
    () => [...sleepScheduleEntries(sleepStart, sleepEnd), ...schedule].filter((e) => e.dayOfWeek === dow),
    [schedule, sleepStart, sleepEnd, dow],
  )

  const todayBlocks = useMemo(
    () => (plan?.blocks ?? []).filter((b) => b.date === today),
    [plan, today],
  )

  const current = todayBlocks.find((b) => b.startMinute <= nowMinute && nowMinute < b.endMinute) ?? null
  const next = todayBlocks.find((b) => b.startMinute > nowMinute) ?? null
  const upcoming = todayBlocks.filter((b) => b.endMinute > nowMinute && b !== current)
  const remainingWork = upcoming.filter((b) => b.kind !== 'ancre').reduce((s, b) => s + b.workMinutes, 0)

  const stuck = plan?.verdicts.filter((v) => v.status !== 'placed') ?? []
  const activeTasks = tasks.filter((t) => t.status === 'active' && t.remainingMinutes > 0)
  // Le sommeil a toujours une valeur par défaut : c'est l'absence d'obligations
  // DÉCLARÉES qui dit que l'application ne connaît pas encore ta vie.
  const needsSetup = schedule.length === 0

  return (
    <PageTransition>
      <div className="mx-auto flex h-full w-full max-w-[1560px] flex-col overflow-y-auto px-14 pb-14 pt-12">
        <header className="mb-10 flex items-end justify-between gap-6">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-text-primary">
              {DAYS[dow]!.charAt(0).toUpperCase() + DAYS[dow]!.slice(1)} {now.getDate()} {MONTHS[now.getMonth()]}
            </h1>
            <p className="mt-1 text-sm text-text-muted">
              {todayBlocks.length === 0
                ? 'Rien de posé aujourd’hui.'
                : remainingWork === 0
                  ? 'Ta journée est derrière toi.'
                  : `${duration(remainingWork)} de travail devant toi.`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex shrink-0 items-center gap-2 rounded-md border border-border-strong px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-card-hover"
          >
            <Plus size={15} /> Ajouter une tâche
          </button>
        </header>

        {/* Trois zones qui occupent la largeur : l'objet, la décision, le détail.
            `flex-wrap` les empile d'elles-mêmes sur une fenêtre étroite. */}
        <div className="flex flex-1 flex-wrap items-center gap-x-16 gap-y-12">
          <TimeCircle entries={todayEntries} blocks={todayBlocks} nowMinute={nowMinute} size={360}>
            <span className="font-mono text-4xl font-semibold tabular-nums text-text-primary">
              {hhmm(nowMinute)}
            </span>
            <span className="mt-1.5 text-xs text-text-muted">
              {todayBlocks.length === 0
                ? 'journée libre'
                : `${todayBlocks.length} bloc${todayBlocks.length > 1 ? 's' : ''} posé${todayBlocks.length > 1 ? 's' : ''}`}
            </span>
          </TimeCircle>

          <motion.div
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.35, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="min-w-[260px] flex-1 space-y-7"
          >
            <Focus label="Maintenant" block={current} nowMinute={nowMinute} empty="Rien en cours." />
            <div className="h-px bg-border-subtle" />
            <Focus label="Ensuite" block={next} nowMinute={nowMinute} empty="Plus rien aujourd’hui." />
            {plan && <Status plan={plan} />}
          </motion.div>

          <div className="min-w-[320px] flex-[1.15] space-y-3">
            {needsSetup && <SetupInvitation />}

            {upcoming.length > 0 && (
              <Disclosure title="Le reste de la journée" summary={`${upcoming.length} blocs`} index={0}>
                <div className="space-y-1.5">
                  {upcoming.map((block) => (
                    <BlockRow key={block.id} block={block} />
                  ))}
                </div>
              </Disclosure>
            )}

            {activeTasks.length > 0 && (
              <Disclosure title="Tâches ouvertes" summary={`${activeTasks.length}`} index={1}>
                <div className="space-y-1.5">
                  {activeTasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      onComplete={() => void completeTask(task.id)}
                      onDelete={() => void deleteTask(task.id)}
                    />
                  ))}
                </div>
                {plan?.wip.overLimit && (
                  <p className="mt-3 text-[11px] text-text-muted">
                    {plan.wip.activeCount} tâches ouvertes pour une limite mesurée à {plan.wip.limit}. Rien
                    n’est bloqué. Terminer avant d’ouvrir reste simplement plus rapide.
                  </p>
                )}
              </Disclosure>
            )}

            {stuck.length > 0 && (
              <Disclosure title="Ce qui ne rentre pas" summary={`${stuck.length}`} tone="danger" index={2}>
                <div className="space-y-1.5">
                  {stuck.map((verdict) => (
                    <div key={verdict.taskId} className="flex items-center gap-3 text-xs">
                      <span className="text-text-primary">{verdict.title}</span>
                      <span className="ml-auto font-mono text-text-muted">
                        {duration(verdict.placedMinutes)} / {duration(verdict.neededMinutes)}
                      </span>
                    </div>
                  ))}
                </div>
              </Disclosure>
            )}

            {plan?.internalError && (
              <p className="rounded-md border border-danger/40 px-4 py-3 text-[11px] text-danger">
                Contrôle post-placement : {plan.internalError.actual} min posées pour{' '}
                {plan.internalError.expected} min décidées. C’est un bug interne, pas une décision.
              </p>
            )}
          </div>
        </div>

        <AddTaskModal
          open={adding}
          onClose={() => setAdding(false)}
          maxPerDayMinutes={Math.round(
            Math.max(0, ...(plan?.capacities.map((c) => c.effectiveCapacityMinutes) ?? [0])) * 0.4,
          )}
          onAdd={addTask}
        />
      </div>
    </PageTransition>
  )
}

function SetupInvitation() {
  return (
    <div className="info-panel flex items-center gap-5 rounded-lg px-6 py-5">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-text-secondary">
          Pour l’instant, l’application ne connaît que tes heures de sommeil.
        </p>
        <p className="mt-1 text-xs text-text-muted">
          Déclare tes cours, ton travail, tes trajets, une seule fois. Tout le reste s’en déduit.
        </p>
      </div>
      <Link
        to="/temps"
        className="shrink-0 rounded-md border border-border-strong px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-card-hover"
      >
        Déclarer mon temps
      </Link>
    </div>
  )
}

function Focus({
  label,
  block,
  nowMinute,
  empty,
}: {
  label: string
  block: PlacedBlock | null
  nowMinute: number
  empty: string
}) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-widest text-text-muted">{label}</p>
      {block ? (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-1.5">
          <p className="truncate text-lg font-medium text-text-primary">{block.label}</p>
          <p className="mt-0.5 font-mono text-xs text-text-secondary">
            {hhmm(block.startMinute)} → {hhmm(block.endMinute)}
            {block.startMinute <= nowMinute && nowMinute < block.endMinute
              ? ` · encore ${duration(block.endMinute - nowMinute)}`
              : ` · dans ${duration(block.startMinute - nowMinute)}`}
          </p>
          {block.breakMinutes > 0 && (
            <p className="mt-0.5 text-[11px] text-text-muted">
              dont {block.breakMinutes} min de pause, incluses dans le bloc
            </p>
          )}
        </motion.div>
      ) : (
        <p className="mt-1.5 text-sm text-text-muted">{empty}</p>
      )}
    </div>
  )
}

function Status({ plan }: { plan: NonNullable<ReturnType<typeof usePlanning>> }) {
  const worst = plan.feasibility.deficits[0]

  if (!worst) {
    if (plan.feasibility.densities.length === 0) return null
    return (
      <p className="flex items-center gap-2 text-xs text-text-muted">
        <Check size={13} className="text-text-secondary" />
        Tout ce que tu as posé tient avant les deadlines.
      </p>
    )
  }

  return (
    <Disclosure
      title="Prouvé impossible dans l’état actuel"
      summary={`il manque ${duration(worst.deficitMinutes)}`}
      tone="danger"
    >
      <div className="space-y-4">
        {plan.feasibility.deficits.map((deficit) => (
          <div key={deficit.deadline}>
            <p className="text-xs text-text-secondary">
              Avant le {deficit.deadline} : {duration(deficit.deficitMinutes)} de trop, soit{' '}
              {Math.round(deficit.deficitRatio * 100)} % du travail demandé.
            </p>
            <ul className="mt-2 space-y-1">
              {deficit.options.map((option) => (
                <li key={option.action} className="flex items-center gap-3 text-xs text-text-muted">
                  <span className="truncate">{option.action}</span>
                  <span className="ml-auto shrink-0 font-mono">+{duration(option.minutesFreed)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Disclosure>
  )
}

function BlockRow({ block }: { block: PlacedBlock }) {
  return (
    <div className="flex items-center gap-3 py-1 text-xs">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: block.color }} />
      <span className="w-24 shrink-0 font-mono text-text-muted">
        {hhmm(block.startMinute)} → {hhmm(block.endMinute)}
      </span>
      <span className="truncate text-text-primary">{block.label}</span>
      {block.reducedToMinimum && <span className="shrink-0 text-[10px] text-warning">réduite</span>}
      {block.capOverride && <span className="shrink-0 text-[10px] text-danger">crise</span>}
      <span className="ml-auto shrink-0 font-mono text-text-muted">{block.workMinutes} min</span>
    </div>
  )
}

function TaskRow({
  task,
  onComplete,
  onDelete,
}: {
  task: TaskItem
  onComplete: () => void
  onDelete: () => void
}) {
  return (
    <div className="group flex items-center gap-3 py-1 text-xs">
      <button
        type="button"
        onClick={onComplete}
        className="shrink-0 text-text-muted transition-colors hover:text-text-primary"
        aria-label="Terminer"
      >
        <Check size={14} />
      </button>
      <span className="truncate text-text-primary">{task.title}</span>
      <span className="ml-auto shrink-0 font-mono text-text-muted">
        {task.deadline.slice(5)} · {duration(task.remainingMinutes)}
      </span>
      <button
        type="button"
        onClick={onDelete}
        className="shrink-0 text-text-muted opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
        aria-label="Supprimer"
      >
        <Trash2 size={13} />
      </button>
    </div>
  )
}

function AddTaskModal({
  open,
  onClose,
  onAdd,
  maxPerDayMinutes,
}: {
  open: boolean
  onClose: () => void
  onAdd: (
    t: Omit<TaskItem, 'id' | 'createdAt' | 'parentTaskId'>,
    options?: { maxPerDayMinutes?: number },
  ) => Promise<void>
  maxPerDayMinutes: number
}) {
  const [draft, setDraft] = useState(() => ({
    title: '',
    deadline: addDays(dateKey(new Date()), 7),
    importance: 5,
    category: 'général',
    workKind: 'routine' as 'routine' | 'novel',
    minutes: 60,
  }))
  const [detailed, setDetailed] = useState(false)

  const submit = () => {
    if (!draft.title.trim()) return
    void onAdd(
      {
        title: draft.title.trim(),
        deadline: draft.deadline,
        importance: draft.importance,
        category: draft.category.trim() || 'général',
        workKind: draft.workKind,
        estimatedMinutes: draft.minutes,
        // Le facteur de correction et le découpage sont appliqués par le
        // store : l'estimation brute n'entre jamais telle quelle dans le plan.
        remainingMinutes: draft.minutes,
        correctionFactor: draft.workKind === 'novel' ? 1.7 : 1.4,
        status: 'active',
      },
      { maxPerDayMinutes },
    )
    setDraft((d) => ({ ...d, title: '' }))
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Ajouter une tâche"
      description="Trois champs suffisent. L’application corrige ton estimation et trouve la place elle-même."
    >
      <div className="space-y-4">
        <Field label="Quoi">
          <input
            autoFocus
            type="text"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="Ce qu’il y a à faire…"
            className={inputClass}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Pour quand">
            <input
              type="date"
              value={draft.deadline}
              onChange={(e) => setDraft({ ...draft, deadline: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="Combien de temps">
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={5}
                max={2400}
                step={5}
                value={draft.minutes}
                onChange={(e) => setDraft({ ...draft, minutes: Number(e.target.value) })}
                className={inputClass}
              />
              <span className="shrink-0 text-xs text-text-muted">min</span>
            </div>
          </Field>
        </div>

        <button
          type="button"
          onClick={() => setDetailed((v) => !v)}
          className="text-[11px] text-text-muted underline-offset-2 transition-colors hover:text-text-secondary hover:underline"
        >
          {detailed ? 'Masquer les détails' : 'Importance, catégorie, nature du travail'}
        </button>

        {detailed && (
          <div className="grid grid-cols-3 gap-3 border-t border-border-subtle pt-4">
            <Field label="Importance">
              <input
                type="number"
                min={1}
                max={10}
                value={draft.importance}
                onChange={(e) => setDraft({ ...draft, importance: Number(e.target.value) })}
                className={inputClass}
              />
            </Field>
            <Field label="Catégorie">
              <input
                type="text"
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label="Nature">
              <select
                value={draft.workKind}
                onChange={(e) => setDraft({ ...draft, workKind: e.target.value as 'routine' | 'novel' })}
                className={inputClass}
              >
                <option value="routine">Connu</option>
                <option value="novel">Nouveau</option>
              </select>
            </Field>
          </div>
        )}

        <div className="flex items-center justify-between gap-4 border-t border-border-subtle pt-4">
          <p className="text-[11px] text-text-muted">
            L’importance se déclare une seule fois. Elle n’est jamais recalculée.
          </p>
          <button
            type="button"
            disabled={!draft.title.trim()}
            onClick={submit}
            className={cn(
              'inline-flex shrink-0 items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors',
              draft.title.trim()
                ? 'bg-accent text-black hover:bg-accent-hover'
                : 'cursor-not-allowed bg-bg-card-hover text-text-muted',
            )}
          >
            Ajouter
          </button>
        </div>
      </div>
    </Modal>
  )
}

const inputClass =
  'w-full rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none transition-colors focus:border-border-strong'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] uppercase tracking-wider text-text-muted">{label}</span>
      {children}
    </label>
  )
}
