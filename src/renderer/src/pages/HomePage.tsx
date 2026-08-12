import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, Anchor, CheckCircle2, Plus, Target, Trash2, Zap } from 'lucide-react'
import { PageTransition } from '@/components/PageTransition'
import { usePlanning } from '@/lib/use-planning'
import { usePlanningStore } from '@/store/planning.store'
import { dateKey, addDays } from '@/lib/planning/dates'
import { cn } from '@/lib/cn'
import type { PlacedBlock, TaskItem } from '@/lib/planning/types'

function hhmm(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
}

function hours(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`
}

const KIND_ICON = {
  task: <Zap size={13} className="text-accent" />,
  objective: <Target size={13} className="text-blue-400" />,
  ancre: <Anchor size={13} className="text-orange-400" />,
} as const

export default function HomePage() {
  const [now] = useState(() => new Date())
  const plan = usePlanning(now)
  const tasks = usePlanningStore((s) => s.tasks)
  const addTask = usePlanningStore((s) => s.addTask)
  const deleteTask = usePlanningStore((s) => s.deleteTask)
  const completeTask = usePlanningStore((s) => s.completeTask)
  const today = dateKey(now)

  const todayBlocks = useMemo(() => plan?.blocks.filter((b) => b.date === today) ?? [], [plan, today])
  const todayCapacity = plan?.capacities.find((c) => c.date === today)
  const placedToday = todayBlocks.filter((b) => b.kind !== 'ancre').reduce((s, b) => s + b.workMinutes, 0)

  return (
    <PageTransition>
      <div className="flex h-full flex-col gap-8 overflow-y-auto px-12 pb-20 pt-16">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight">Aujourd’hui</h1>
          <p className="mt-1 text-sm text-text-secondary">
            {todayBlocks.length === 0
              ? 'Rien de placé pour le moment.'
              : `${hours(placedToday)} de travail placé sur ${hours(todayCapacity?.effectiveCapacityMinutes ?? 0)} disponibles.`}
          </p>
        </header>

        {plan && <FeasibilityBanner plan={plan} />}

        <section>
          <h2 className="mb-3 text-sm font-semibold text-text-primary">Le plan du jour</h2>
          {todayBlocks.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border-subtle px-5 py-10 text-center text-sm text-text-muted">
              Rien à placer — ou rien où le placer. Déclare ton temps dans « Mon temps », puis ajoute une tâche.
            </div>
          ) : (
            <div className="space-y-2">
              {todayBlocks.map((block) => (
                <BlockRow key={block.id} block={block} />
              ))}
            </div>
          )}
        </section>

        {plan && plan.verdicts.length > 0 && <Verdicts plan={plan} />}

        {plan?.internalError && (
          <p className="rounded-md border border-red-500/40 bg-red-500/5 px-4 py-3 text-xs text-red-300">
            Contrôle post-placement : {plan.internalError.actual} min posées pour {plan.internalError.expected} min
            décidées (écart {plan.internalError.diff}). C’est un bug interne, pas une décision.
          </p>
        )}

        <TaskList tasks={tasks} onDelete={deleteTask} onComplete={completeTask} />

        {/* B.5 : le plafond d'un jour, mesuré — 40 % du meilleur jour à venir. */}
        <QuickAddTask
          maxPerDayMinutes={Math.round(
            Math.max(0, ...(plan?.capacities.map((c) => c.effectiveCapacityMinutes) ?? [0])) * 0.4,
          )}
          onAdd={addTask}
        />

        {plan?.wip.overLimit && (
          <p className="text-xs text-text-muted">
            {plan.wip.activeCount} tâches ouvertes pour une limite de {plan.wip.limit}. Finis-en une avant d’en
            ouvrir une autre — rien n’est bloqué, c’est juste plus efficace.
          </p>
        )}
      </div>
    </PageTransition>
  )
}

function BlockRow({ block }: { block: PlacedBlock }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-center gap-3 rounded-md border border-border-subtle bg-bg-card px-4 py-3"
    >
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: block.color }} />
      <span className="font-mono text-xs text-text-muted">
        {hhmm(block.startMinute)}–{hhmm(block.endMinute)}
      </span>
      <span className="text-sm font-medium text-text-primary">{block.label}</span>
      {block.reducedToMinimum && (
        <span className="rounded border border-orange-500/40 px-1.5 py-0.5 text-[10px] text-orange-300">
          version minimale
        </span>
      )}
      {block.capOverride && (
        <span className="rounded border border-red-500/40 px-1.5 py-0.5 text-[10px] text-red-300">crise</span>
      )}
      <span className="ml-auto flex items-center gap-3 text-xs text-text-muted">
        {block.breakMinutes > 0 && <span>dont {block.breakMinutes} min de pause</span>}
        <span className="font-mono">{block.workMinutes} min</span>
        {KIND_ICON[block.kind]}
      </span>
    </motion.div>
  )
}

function FeasibilityBanner({ plan }: { plan: NonNullable<ReturnType<typeof usePlanning>> }) {
  const feasible = plan.feasibility.globallyFeasible

  return (
    <div
      className={cn(
        'rounded-lg border px-5 py-4',
        feasible ? 'border-accent/30 bg-accent/5' : 'border-red-500/30 bg-red-500/5',
      )}
    >
      <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
        {feasible ? (
          <>
            <CheckCircle2 size={15} className="text-accent" /> Tout ce que tu as posé tient avant les deadlines.
          </>
        ) : (
          <>
            <AlertTriangle size={15} className="text-red-400" /> Prouvé impossible dans l’état actuel.
          </>
        )}
      </div>

      {plan.feasibility.deficits.map((d) => (
        <div key={d.deadline} className="mt-3 text-xs">
          <p className="text-text-secondary">
            Avant le {d.deadline} : il manque <span className="font-mono text-red-300">{hours(d.deficitMinutes)}</span>{' '}
            ({Math.round(d.deficitRatio * 100)} % du travail demandé).
          </p>
          <ul className="mt-1.5 space-y-1 text-text-muted">
            {d.options.map((o) => (
              <li key={o.action}>
                · {o.action} <span className="font-mono">→ +{hours(o.minutesFreed)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function Verdicts({ plan }: { plan: NonNullable<ReturnType<typeof usePlanning>> }) {
  const partial = plan.verdicts.filter((v) => v.status !== 'placed')
  if (partial.length === 0) return null

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-text-primary">Ce qui ne rentre pas entièrement</h2>
      <div className="space-y-1.5">
        {partial.map((v) => (
          <div key={v.taskId} className="flex items-center gap-3 rounded-md border border-border-subtle px-3 py-2 text-xs">
            <span className="text-text-primary">{v.title}</span>
            <span className="ml-auto font-mono text-text-muted">
              {hours(v.placedMinutes)} placées / {hours(v.neededMinutes)}
            </span>
            <span
              className={cn(
                'rounded px-1.5 py-0.5 text-[10px]',
                v.status === 'partial' ? 'bg-orange-500/15 text-orange-300' : 'bg-red-500/15 text-red-300',
              )}
            >
              {v.status === 'partial' ? 'partielle' : 'non placée'}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

function TaskList({
  tasks,
  onDelete,
  onComplete,
}: {
  tasks: TaskItem[]
  onDelete: (id: string) => Promise<void>
  onComplete: (id: string, measured?: number) => Promise<void>
}) {
  const active = tasks.filter((t) => t.status === 'active')
  if (active.length === 0) return null

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-text-primary">Tâches ouvertes</h2>
      <div className="space-y-1.5">
        {active.map((t) => (
          <div key={t.id} className="flex items-center gap-3 rounded-md border border-border-subtle bg-bg-card px-3 py-2">
            <button
              type="button"
              onClick={() => void onComplete(t.id)}
              className="text-text-muted transition-colors hover:text-accent"
              aria-label="Terminer"
            >
              <CheckCircle2 size={15} />
            </button>
            <span className="text-sm text-text-primary">{t.title}</span>
            <span className="rounded bg-bg-base px-1.5 py-0.5 text-[10px] text-text-muted">{t.category}</span>
            <span className="ml-auto font-mono text-xs text-text-muted">
              {t.deadline} · {hours(t.remainingMinutes)} · imp. {t.importance}
            </span>
            <button
              type="button"
              onClick={() => void onDelete(t.id)}
              className="text-text-muted transition-colors hover:text-red-400"
              aria-label="Supprimer"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}

function QuickAddTask({
  onAdd,
  maxPerDayMinutes,
}: {
  onAdd: (t: Omit<TaskItem, 'id' | 'createdAt' | 'parentTaskId'>, options?: { maxPerDayMinutes?: number }) => Promise<void>
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
  }

  return (
    <section className="rounded-lg border border-border-subtle bg-bg-card p-5 shadow-card">
      <h2 className="mb-3 text-sm font-semibold text-text-primary">Ajouter une tâche</h2>
      <div className="flex flex-col gap-3">
        <input
          type="text"
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Ce qu'il y a à faire…"
          className="rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
        />
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-text-muted">
            Pour le
            <input
              type="date"
              value={draft.deadline}
              onChange={(e) => setDraft({ ...draft, deadline: e.target.value })}
              className="rounded-md border border-border-subtle bg-bg-base px-2 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
            />
          </label>
          <input
            type="text"
            value={draft.category}
            onChange={(e) => setDraft({ ...draft, category: e.target.value })}
            title="Catégorie — porte le facteur de correction appris"
            className="w-32 rounded-md border border-border-subtle bg-bg-base px-2 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
          />
          <select
            value={draft.workKind}
            onChange={(e) => setDraft({ ...draft, workKind: e.target.value as 'routine' | 'novel' })}
            className="rounded-md border border-border-subtle bg-bg-base px-2 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
          >
            <option value="routine">Travail connu</option>
            <option value="novel">Nouveau / créatif</option>
          </select>
          <label className="flex items-center gap-1.5 text-xs text-text-muted">
            <input
              type="number"
              min={5}
              max={2400}
              step={5}
              value={draft.minutes}
              onChange={(e) => setDraft({ ...draft, minutes: Number(e.target.value) })}
              className="w-20 rounded-md border border-border-subtle bg-bg-base px-2 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
            />
            min estimées
          </label>
          <label className="flex items-center gap-1.5 text-xs text-text-muted">
            <input
              type="number"
              min={1}
              max={10}
              value={draft.importance}
              onChange={(e) => setDraft({ ...draft, importance: Number(e.target.value) })}
              className="w-16 rounded-md border border-border-subtle bg-bg-base px-2 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
            />
            importance
          </label>
          <button
            type="button"
            disabled={!draft.title.trim()}
            onClick={submit}
            className="ml-auto inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
          >
            <Plus size={15} /> Ajouter
          </button>
        </div>
        <p className="text-[11px] text-text-muted">
          L’importance se déclare une seule fois, à la création. Elle n’est jamais recalculée ni devinée.
        </p>
      </div>
    </section>
  )
}
